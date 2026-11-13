// The Sonos WebSocket through the gateway's relay: the desktop's src/sonos-ws.ts in gateway mode.
// A browser cannot set headers on a WebSocket, so the Entra ID token rides in a second subprotocol
// (`bearer.<token>`), never in the URL. The relay selects the first, 'v1.api.smartspeaker.audio'.

import type { WebAuth } from './types';
import type { SonosConfig } from './sonosHttp';
import type { Store } from './storage';
import { channel } from './events';
import { noteFrame, playbackFields, record, setRelayOpen } from './diagnostics';

const PROTOCOL = 'v1.api.smartspeaker.audio';
const PROBE_MS = 5_000; // the gateway pings every 30 s; a live socket answers a subscribe far sooner
const OPEN = 1; // WebSocket.OPEN: the injected class need not carry the constant
export const PREFERRED_KEY = 'tt.preferredCoordinatorId';

export interface GroupInfo {
  id: string; // full groupId with session (RINCON_xxx:sessionId)
  coordinatorId: string; // bare RINCON ID, used as queueId
  name: string; // room/group name
  playerIds: string[];
}

interface WsDevice {
  info?: { id?: string; name?: string };
  groupId?: string;
  isCoordinator?: boolean;
}

function extractDevices(payload: unknown): { coordinatorGroupIds: string[]; playerIds: string[]; groups: GroupInfo[] } {
  const devices: WsDevice[] = (payload as { devices?: WsDevice[] } | null)?.devices ?? [];

  // groupId -> coordinator and all members
  const groupMap = new Map<string, { coordinator?: WsDevice; members: WsDevice[] }>();
  for (const d of devices) {
    if (!d.groupId) continue;
    let g = groupMap.get(d.groupId);
    if (!g) groupMap.set(d.groupId, (g = { members: [] }));
    g.members.push(d);
    if (d.isCoordinator) g.coordinator = d;
  }

  const coordinatorGroupIds: string[] = [];
  const groups: GroupInfo[] = [];
  for (const [groupId, { coordinator, members }] of groupMap) {
    if (!coordinator?.info?.id) continue;
    coordinatorGroupIds.push(groupId);
    groups.push({
      id: groupId,
      coordinatorId: coordinator.info.id,
      name: coordinator.info.name ?? coordinator.info.id,
      playerIds: members.map((m) => m.info?.id ?? '').filter(Boolean),
    });
  }

  // Player IDs, deduplicated across all groups
  const playerIds = [...new Set(devices.map((d) => d.info?.id).filter((id): id is string => !!id))];
  return { coordinatorGroupIds, playerIds, groups };
}

export interface SonosSocket {
  /** Opens the relay (resolves once the socket exists, not when the bootstrap is done). Reconnects until `stop`. */
  start(): Promise<void>;
  stop(): void;
  isOpen(): boolean;
  /** One command and its response, matched by corrId. Rejects when the socket is not open or after 10 s. */
  send(header: Record<string, unknown>, payload: Record<string, unknown>): Promise<unknown>;
  groups(): GroupInfo[];
  setGroup(groupId: string): { ok?: boolean; error?: string };
  refreshPlayback(): void;
  resync(): void;
  /** The page came back to the foreground (phone unlocked, tab shown): reconnect or refresh, whichever is needed. */
  wake(): void;
  onReady(cb: () => void): Unsubscribe;
  onGroups(cb: (groups: unknown[]) => void): Unsubscribe;
  onMessage(cb: (header: unknown, payload: unknown) => void): Unsubscribe;
}

export function createSonosSocket(o: {
  auth: WebAuth;
  WebSocket: typeof WebSocket;
  url: string;
  config: SonosConfig;
  store: Store;
  discoverServiceCredentials: () => Promise<void>;
  /** No token can be had: the user must sign in again. The socket stops until `start` is called again. */
  onExpired: () => void;
}): SonosSocket {
  const { config, store } = o;

  let ws: WebSocket | null = null;
  let stopped = true;
  let connecting = false;
  let reconnectDelay = 1000;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** The last connection never opened: the gateway probably refused the token, so the next one gets a fresh one. */
  let refreshNext = false;
  let groups: GroupInfo[] = [];

  const ready = channel<void>();
  const groupsChannel = channel<unknown[]>();
  const messageSubs = new Set<(header: unknown, payload: unknown) => void>();
  /** The last playbackExtended and groupVolume message of the active group, replayed to a late subscriber. */
  const lastMessages = new Map<string, [unknown, unknown]>();
  /** Groups whose status push has been forwarded on this connection: a later subscribe response must not overwrite it. */
  const pushedGroups = new Set<string>();

  // Keyed by corrId: resolves when the matching response arrives
  const pending = new Map<string, (payload: unknown) => void>();
  // Keyed by 'namespace:name': one-shot, fired on the first matching push
  const pushOnce = new Map<string, (payload: unknown) => void>();

  const isOpen = () => ws !== null && ws.readyState === OPEN;

  function send(header: Record<string, unknown>, payload: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!ws || ws.readyState !== OPEN) {
        reject(new Error('WebSocket not open'));
        return;
      }
      const corrId = crypto.randomUUID();
      const timer = setTimeout(() => {
        pending.delete(corrId);
        reject(new Error(`WS timeout: ${JSON.stringify(header)}`));
      }, 10_000);
      pending.set(corrId, (p) => {
        clearTimeout(timer);
        resolve(p);
      });
      ws.send(JSON.stringify([{ ...header, corrId }, payload]));
    });
  }

  function emitMessage(
    header: Record<string, unknown>,
    payload: unknown,
    source: 'push' | 'response' | 'bootstrap' = 'push'
  ): void {
    const ns = header['namespace'];
    if (ns === 'playbackExtended') {
      // The replay keeps the last full status with later partial messages merged into it, not just the last message.
      const prev = lastMessages.get(ns)?.[1];
      const merged = prev && payload && typeof payload === 'object' ? { ...prev, ...payload } : payload;
      lastMessages.set(ns, [header, merged]);
      record({ at: Date.now(), kind: 'playback', source, has: playbackFields(payload) });
    } else if (ns === 'groupVolume') {
      lastMessages.set(ns, [header, payload]);
    }
    for (const cb of [...messageSubs]) cb(header, payload);
  }

  function handleMessage(data: unknown): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(data));
    } catch {
      return;
    }
    if (!Array.isArray(parsed) || typeof parsed[0] !== 'object' || parsed[0] === null) return;
    const header: Record<string, unknown> = Object.fromEntries(Object.entries(parsed[0]));
    const payload: unknown = parsed[1];

    noteFrame(Date.now());
    // Resolve a pending command response
    const corrId = header['corrId'];
    if (typeof corrId === 'string') {
      const resolve = pending.get(corrId);
      if (resolve) {
        pending.delete(corrId);
        resolve(payload);
      }
    }

    // Fire a one-shot push listener
    const ns = header['namespace'];
    const name = header['name'] ?? header['type'];
    if (typeof ns === 'string' && typeof name === 'string') {
      const key = `${ns}:${name}`;
      const once = pushOnce.get(key);
      if (once) {
        pushOnce.delete(key);
        once(payload);
      }
    }

    // For playbackExtended and groupVolume only forward the active group: during bootstrap every subscribed group
    // pushes a status, and the renderer updates unconditionally, so another group's push would corrupt the display.
    const msgGroupId = header['groupId'];
    if (
      (ns === 'playbackExtended' || ns === 'groupVolume') &&
      msgGroupId &&
      config.groupId &&
      msgGroupId !== config.groupId
    ) {
      return;
    }
    const isResponse = typeof corrId === 'string';
    if (ns === 'playbackExtended' && typeof msgGroupId === 'string') {
      if (!isResponse) pushedGroups.add(msgGroupId);
      else if (pushedGroups.has(msgGroupId) && !playbackFields(payload).state) {
        // A subscribe response with no status, after a push: older and emptier, so the renderer never sees it.
        record({ at: Date.now(), kind: 'playback', source: 'skipped', has: playbackFields(payload) });
        return;
      }
    }
    emitMessage(header, payload, isResponse ? 'response' : 'push');
  }

  // ─── Bootstrap ─────────────────────────────────────────────────────────────────

  async function runBootstrap(): Promise<void> {
    // 1. Households: confirms the connection and gives the live householdId
    const householdsResp = await send({ command: 'getHouseholds', namespace: 'households' }, { connectedOnly: 'true' });
    const households = (householdsResp as { households?: Array<{ id: string }> } | null)?.households ?? [];
    const householdId = households[0]?.id ?? config.householdId;
    config.householdId = householdId;

    // 1b. Discover serviceId/accountId if not known yet. It is two slow catalogue calls (about 2.5 s) that the
    // subscriptions below do not need, so it runs beside them: playback arrives without waiting for it.
    const discovery = o.discoverServiceCredentials();
    discovery.catch(() => {}); // awaited before `ready`; this only keeps an early failure from being unhandled

    // 2. Subscribe to devices; the immediate push carries the full topology
    const devicesPayload = await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('devices push timeout')), 10_000);
      pushOnce.set('devices:devicesStatus', (p) => {
        clearTimeout(timer);
        resolve(p);
      });
      send({ namespace: 'devices', householdId, command: 'subscribe' }, {}).catch(reject);
    });

    const { coordinatorGroupIds, playerIds, groups: found } = extractDevices(devicesPayload);

    // Restore the saved group (matched by its stable coordinatorId) if it is in this household; otherwise use the
    // first group and remember that as the preference.
    groups = found;
    if (found.length > 0) {
      const preferred = store.get(PREFERRED_KEY);
      const saved = preferred ? found.find((g) => g.coordinatorId === preferred) : undefined;
      const active = saved ?? found[0];
      config.groupId = active.id;
      if (!saved) store.set(PREFERRED_KEY, active.coordinatorId);
    }

    // 3. playbackExtended first, so we can capture the initial state
    const pbSubs = await Promise.all(
      coordinatorGroupIds.map((groupId) =>
        send({ namespace: 'playbackExtended', groupId, command: 'subscribe' }, {})
          .then((resp) => ({ groupId, resp }))
          .catch(() => null)
      )
    );

    // 4. groupVolume (responses seed the active group's initial volume) and player-level hardware
    const [volSubs] = await Promise.all([
      Promise.all(
        coordinatorGroupIds.map((groupId) =>
          send({ namespace: 'groupVolume', groupId, command: 'subscribe' }, {})
            .then((resp) => ({ groupId, resp }))
            .catch(() => null)
        )
      ),
      ...playerIds.flatMap((playerId) => [
        send({ namespace: 'playerVolume', playerId, command: 'subscribe' }, {}),
        send({ namespace: 'hardwareStatus', playerId, command: 'subscribe' }, {}),
      ]),
    ]);

    await discovery;
    ready.emit();
    groupsChannel.emit(found);

    // The active group's initial playback and volume again: the subscribe responses may have gone by before the
    // app subscribed to messages.
    const activePb = pbSubs.find((r) => r?.groupId === config.groupId);
    // ...but only if no status push for it has arrived since: the response is older, and may be emptier.
    if (activePb?.resp) {
      if (pushedGroups.has(activePb.groupId) || !playbackFields(activePb.resp).state) {
        record({ at: Date.now(), kind: 'playback', source: 'skipped', has: playbackFields(activePb.resp) });
      } else {
        emitMessage({ namespace: 'playbackExtended', groupId: activePb.groupId }, activePb.resp, 'bootstrap');
      }
    }
    const activeVol = volSubs.find((r) => r?.groupId === config.groupId);
    if (activeVol?.resp) emitMessage({ namespace: 'groupVolume', groupId: activeVol.groupId }, activeVol.resp);
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────────

  function scheduleReconnect(): void {
    if (stopped || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
      void connect();
    }, reconnectDelay);
  }

  async function connect(): Promise<void> {
    if (stopped || connecting || (ws && ws.readyState <= OPEN)) return;
    connecting = true;
    let token: string | null;
    try {
      token = await o.auth.idToken(refreshNext ? { forceRefresh: true } : undefined);
    } finally {
      connecting = false;
    }
    if (stopped) return;
    if (!token) {
      stopped = true;
      o.onExpired();
      return;
    }

    const sock = new o.WebSocket(o.url, [PROTOCOL, `bearer.${token}`]);
    ws = sock;
    let opened = false;

    record({ at: Date.now(), kind: 'connect' });
    sock.addEventListener('open', () => {
      opened = true;
      pushedGroups.clear();
      setRelayOpen(true);
      noteFrame(Date.now());
      record({ at: Date.now(), kind: 'open' });
      refreshNext = false;
      reconnectDelay = 1000; // reset backoff on a successful connect
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      runBootstrap()
        .then(() => record({ at: Date.now(), kind: 'bootstrap' }))
        .catch(() => sock.close());
    });
    sock.addEventListener('message', (e) => handleMessage(e.data));
    sock.addEventListener('close', (e) => {
      if (ws === sock) {
        ws = null;
        setRelayOpen(false);
      }
      record({ at: Date.now(), kind: 'close', code: (e as CloseEvent).code ?? 0 });
      if (!opened) refreshNext = true;
      scheduleReconnect();
    });
  }

  function setGroup(groupId: string): { ok?: boolean; error?: string } {
    const group = groups.find((g) => g.id === groupId);
    if (!group) return { error: `Unknown group: ${groupId}` };
    config.groupId = group.id;
    store.set(PREFERRED_KEY, group.coordinatorId);
    lastMessages.clear();
    // Re-subscribing makes Sonos push fresh playbackExtended and groupVolume state for the new group, which is
    // forwarded like any other message, so the UI shows the new group at once.
    if (isOpen()) {
      send({ namespace: 'playbackExtended', groupId: group.id, command: 'subscribe' }, {}).catch(() => {});
      send({ namespace: 'groupVolume', groupId: group.id, command: 'subscribe' }, {}).catch(() => {});
    }
    return { ok: true };
  }

  /** Phones drop or silently half-kill the socket in the background: reconnect at once, or prove the open one lives. */
  function wake(): void {
    if (stopped) return;
    record({ at: Date.now(), kind: 'wake' });
    if (!isOpen()) {
      reconnectDelay = 1000;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      void connect();
      return;
    }
    if (!config.groupId) return; // bootstrap has not finished
    // The subscribe response doubles as a liveness probe (a browser never sees WebSocket pings): no answer means
    // the socket is half-open, so drop it and reconnect now. A live one answers with a fresh full status.
    const sock = ws;
    let timer: ReturnType<typeof setTimeout>;
    const dead = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('no answer')), PROBE_MS);
    });
    Promise.race([send({ namespace: 'playbackExtended', groupId: config.groupId, command: 'subscribe' }, {}), dead])
      .catch(() => {
        if (ws !== sock) return;
        record({ at: Date.now(), kind: 'probe-failed' });
        ws = null;
        setRelayOpen(false);
        sock?.close();
        reconnectDelay = 1000;
        void connect();
      })
      .finally(() => clearTimeout(timer));
  }

  return {
    wake,
    start() {
      stopped = false;
      reconnectDelay = 1000;
      return connect();
    },
    stop() {
      stopped = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      ws?.close();
      ws = null;
    },
    isOpen,
    send,
    groups: () => groups,
    setGroup,
    refreshPlayback() {
      // Re-subscribing triggers Sonos to push the current playbackExtended state immediately
      if (isOpen())
        send({ namespace: 'playbackExtended', groupId: config.groupId, command: 'subscribe' }, {}).catch(() => {});
    },
    resync() {
      if (!isOpen()) {
        // The socket is down: connect afresh (the bootstrap runs when it opens), unless it was stopped on
        // purpose: only start() restarts it.
        if (!stopped) void connect();
        return;
      }
      if (groups.length === 0) return; // bootstrap has not finished
      ready.emit();
      groupsChannel.emit(groups);
      if (config.groupId) {
        send({ namespace: 'playbackExtended', groupId: config.groupId, command: 'subscribe' }, {}).catch(() => {});
      }
    },
    onReady: (cb) => ready.on(cb),
    onGroups: (cb) => groupsChannel.on(cb),
    onMessage(cb) {
      messageSubs.add(cb);
      for (const [header, payload] of lastMessages.values()) {
        queueMicrotask(() => {
          if (!messageSubs.has(cb)) return;
          if ((header as Record<string, unknown>)['namespace'] === 'playbackExtended') {
            record({ at: Date.now(), kind: 'playback', source: 'replay', has: playbackFields(payload) });
          }
          cb(header, payload);
        });
      }
      return () => {
        messageSubs.delete(cb);
      };
    },
  };
}
