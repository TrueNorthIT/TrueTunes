// Ported from TrueTunes/src/main.ts (WebSocket section: wsSend, handleWsMessage, runBootstrap,
// connectWebSocket, scheduleReconnect, group/transport IPC handlers). Platform-neutral: the socket,
// timers and renderer broadcast are injected so it runs in Node tests and in React Native.

import { BASE_URL, SESSION_COOKIE, SPOOF_UA, WS_SUBPROTOCOL, WS_URL } from './constants';
import { extractDevices, findTicket, newCorrId } from './protocol';
import type { GroupInfo } from './protocol';
import type { SonosConfig } from './types';

const WS_OPEN = 1;
const SEND_TIMEOUT_MS = 10_000;

/** The subset of the browser/RN WebSocket API the session needs. */
export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(code?: number): void;
  onopen: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onerror: ((e: { message?: string }) => void) | null;
  onclose: ((e: { code: number }) => void) | null;
}

export type SocketFactory = (url: string, protocols: string[], headers: Record<string, string>) => SocketLike;

export type WsConfig = SonosConfig & {
  /** Stable coordinator RINCON ID for the preferred group - persisted across sessions. */
  preferredCoordinatorId?: string;
};

/** Coarse connection state for the UI. 'connecting' covers ticket fetch, socket open and bootstrap. */
export type WsStatus = 'connecting' | 'connected' | 'disconnected';

/** Channels mirror the Electron ipcRenderer events so the bridge stays 1:1 with desktop. */
export type WsBroadcast =
  | { channel: 'ws:ready' }
  | { channel: 'ws:groups'; groups: GroupInfo[] }
  | { channel: 'ws:message'; header: Record<string, unknown>; payload: unknown };

export interface WsSessionDeps {
  config: WsConfig;
  getSessionToken: () => string | null;
  createSocket: SocketFactory;
  discoverServiceCredentials: () => Promise<void>;
  broadcast: (msg: WsBroadcast) => void;
  /** Persist config (preferredCoordinatorId changed). */
  onConfigChanged?: () => void;
  onPlaybackState?: (isPlaying: boolean) => void;
  onStatus?: (status: WsStatus) => void;
  fetchImpl?: typeof fetch;
  log?: (...args: unknown[]) => void;
  onEvent?: (name: string, props?: Record<string, string | number>) => void;
  onException?: (err: unknown, props?: Record<string, string>) => void;
}

type NotConnected = { error: 'WS not connected' };
const NOT_CONNECTED: NotConnected = { error: 'WS not connected' };

export class WsSession {
  private ws: SocketLike | null = null;
  private reconnectDelay = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private quitting = false;
  private discoveredGroups: GroupInfo[] = [];

  // corrId -> resolver for command responses
  private pending = new Map<string, (payload: unknown) => void>();
  // 'namespace:name' -> one-shot resolver for the first matching push
  private pushOnce = new Map<string, (payload: unknown) => void>();

  private readonly config: WsConfig;
  private readonly doFetch: typeof fetch;
  private readonly log: (...args: unknown[]) => void;
  private readonly emit: (name: string, props?: Record<string, string | number>) => void;

  constructor(private readonly deps: WsSessionDeps) {
    this.config = deps.config;
    this.doFetch = deps.fetchImpl ?? fetch;
    this.log = deps.log ?? (() => {});
    this.emit = deps.onEvent ?? (() => {});
  }

  private householdWaiters: Array<() => void> = [];
  private status: WsStatus = 'disconnected';

  private setStatus(next: WsStatus): void {
    if (next === this.status) return;
    this.status = next;
    this.deps.onStatus?.(next);
  }

  get connectionStatus(): WsStatus {
    return this.status;
  }

  /**
   * Resolves once the bootstrap has discovered the householdId, or after `timeoutMs` if it never
   * does. Never rejects - callers re-check config.householdId.
   */
  whenHousehold(timeoutMs = 15_000): Promise<void> {
    if (this.config.householdId) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        this.householdWaiters = this.householdWaiters.filter((w) => w !== done);
        resolve();
      }, timeoutMs);
      this.householdWaiters.push(done);
    });
  }

  get groups(): GroupInfo[] {
    return this.discoveredGroups;
  }

  get isOpen(): boolean {
    return this.ws?.readyState === WS_OPEN;
  }

  // ─── Messaging ─────────────────────────────────────────────────────────────

  send(header: Record<string, unknown>, payload: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const ws = this.ws;
      if (!ws || ws.readyState !== WS_OPEN) {
        reject(new Error('WebSocket not open'));
        return;
      }
      const corrId = newCorrId();
      const timer = setTimeout(() => {
        this.pending.delete(corrId);
        this.emit('ws_timeout', {
          namespace: String(header['namespace'] ?? ''),
          command: String(header['command'] ?? ''),
        });
        reject(new Error(`WS timeout: ${JSON.stringify(header)}`));
      }, SEND_TIMEOUT_MS);
      this.pending.set(corrId, (p) => {
        clearTimeout(timer);
        resolve(p);
      });
      ws.send(JSON.stringify([{ ...header, corrId }, payload]));
    });
  }

  private handleMessage(raw: unknown): void {
    let parsed: [Record<string, unknown>, unknown];
    try {
      parsed = JSON.parse(String(raw)) as [Record<string, unknown>, unknown];
    } catch {
      return;
    }
    const [header, payload] = parsed;

    // Resolve a pending command response
    const corrId = header['corrId'] as string | undefined;
    if (corrId && this.pending.has(corrId)) {
      this.pending.get(corrId)!(payload);
      this.pending.delete(corrId);
    }

    // Fire one-shot push listener
    const ns = header['namespace'] as string | undefined;
    const name = (header['name'] ?? header['type']) as string | undefined;
    if (ns && name) {
      const key = `${ns}:${name}`;
      const waiter = this.pushOnce.get(key);
      if (waiter) {
        waiter(payload);
        this.pushOnce.delete(key);
      }
    }

    // For playbackExtended and groupVolume only forward the active group - during bootstrap every
    // subscribed group pushes a status immediately, and the UI updates state unconditionally on
    // these events, so other groups' pushes would corrupt the active group's display.
    const msgGroupId = header['groupId'] as string | undefined;
    if (
      (ns === 'playbackExtended' || ns === 'groupVolume') &&
      msgGroupId &&
      this.config.groupId &&
      msgGroupId !== this.config.groupId
    ) {
      return;
    }

    if (ns === 'playbackExtended') {
      const state = (payload as Record<string, unknown> | null)?.['playback'] as Record<string, unknown> | undefined;
      if (state?.['playbackState']) {
        this.deps.onPlaybackState?.(state['playbackState'] === 'PLAYBACK_STATE_PLAYING');
      }
    }

    this.deps.broadcast({ channel: 'ws:message', header, payload });
  }

  // ─── Bootstrap ─────────────────────────────────────────────────────────────

  private async runBootstrap(): Promise<void> {
    this.log('[ws] Bootstrap start');
    const { config } = this;

    // 1 - households (confirms connection, gives live householdId)
    const householdsResp = await this.send(
      { command: 'getHouseholds', namespace: 'households' },
      { connectedOnly: 'true' }
    );
    const households = (householdsResp as { households?: Array<{ id: string }> })?.households ?? [];
    const householdId = households[0]?.id ?? config.householdId;
    config.householdId = householdId;
    this.log('[ws] Household:', householdId);
    if (householdId) {
      const waiters = this.householdWaiters;
      this.householdWaiters = [];
      waiters.forEach((w) => w());
    }

    // 1b - discover serviceId/accountId if not already known
    await this.deps.discoverServiceCredentials();

    // 2 - subscribe to devices; the immediate push carries the full topology
    const devicesPayload = await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('devices push timeout')), SEND_TIMEOUT_MS);
      this.pushOnce.set('devices:devicesStatus', (p) => {
        clearTimeout(timer);
        resolve(p);
      });
      this.send({ namespace: 'devices', householdId, command: 'subscribe' }, {}).catch(reject);
    });

    const { coordinatorGroupIds, playerIds, groups } = extractDevices(devicesPayload);
    this.log(`[ws] ${coordinatorGroupIds.length} coordinator group(s), ${playerIds.length} player(s)`);

    // Restore the saved group preference (matched by stable coordinatorId) if it exists in the
    // current household; otherwise fall back to the first group and persist that.
    this.discoveredGroups = groups;
    if (groups.length > 0) {
      const saved = config.preferredCoordinatorId
        ? groups.find((g) => g.coordinatorId === config.preferredCoordinatorId)
        : null;
      const active = saved ?? groups[0];
      config.groupId = active.id;
      // The queue ID is the coordinator's player ID. Desktop leaves this to the renderer's setQueueId,
      // which races with the first queue call; setting it here removes that gap.
      config.queueId = active.coordinatorId;
      if (!saved) {
        config.preferredCoordinatorId = active.coordinatorId;
        this.deps.onConfigChanged?.();
      }
      this.log(`[ws] Active group: "${active.name}" (${active.id})`);
    }

    // 3 - playbackExtended first so we can capture initial state
    const pbSubResults = await Promise.all(
      coordinatorGroupIds.map((groupId) =>
        this.send({ namespace: 'playbackExtended', groupId, command: 'subscribe' }, {})
          .then((resp) => ({ groupId, resp }))
          .catch(() => null)
      )
    );

    // 4 - groupVolume (capture responses to seed the initial volume) and player-level hardware
    const [volSubResults] = await Promise.all([
      Promise.all(
        coordinatorGroupIds.map((groupId) =>
          this.send({ namespace: 'groupVolume', groupId, command: 'subscribe' }, {})
            .then((resp) => ({ groupId, resp }))
            .catch(() => null)
        )
      ),
      ...playerIds.flatMap((playerId) => [
        this.send({ namespace: 'playerVolume', playerId, command: 'subscribe' }, {}),
        this.send({ namespace: 'hardwareStatus', playerId, command: 'subscribe' }, {}),
      ]),
    ]);

    this.deps.broadcast({ channel: 'ws:ready' });
    this.deps.broadcast({ channel: 'ws:groups', groups });

    // Subscribe responses arrive before any UI listener exists, so re-broadcast the active
    // group's initial playback and volume as ordinary pushes.
    const activePb = pbSubResults.find((r) => r?.groupId === config.groupId);
    if (activePb?.resp) {
      this.deps.broadcast({
        channel: 'ws:message',
        header: { namespace: 'playbackExtended', groupId: activePb.groupId },
        payload: activePb.resp,
      });
    }
    const activeVol = volSubResults.find((r) => r?.groupId === config.groupId);
    if (activeVol?.resp) {
      this.deps.broadcast({
        channel: 'ws:message',
        header: { namespace: 'groupVolume', groupId: activeVol.groupId },
        payload: activeVol.resp,
      });
    }

    this.log('[ws] Bootstrap complete');
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  private async fetchMfeData(): Promise<unknown> {
    const token = this.deps.getSessionToken();
    if (!token) throw new Error('No session token');
    const res = await this.doFetch(`${BASE_URL}/api/mfe`, {
      headers: {
        Cookie: `${SESSION_COOKIE}=${token}`,
        'User-Agent': SPOOF_UA,
        Accept: '*/*',
        Referer: `${BASE_URL}/en-us/web-app`,
      },
    });
    if (!res.ok) throw new Error(`MFE fetch ${res.status}`);
    return res.json();
  }

  private scheduleReconnect(): void {
    if (this.quitting) return;
    if (this.reconnectTimer) return; // already pending
    this.log(`[ws] Reconnecting in ${this.reconnectDelay / 1000}s`);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);
      await this.connect();
    }, this.reconnectDelay);
  }

  /** Fetch a fresh ticket, open the socket and run the bootstrap. Safe to call repeatedly. */
  async connect(): Promise<void> {
    this.quitting = false;
    // Guard against double-connect
    if (this.ws && this.ws.readyState <= WS_OPEN) return;
    this.setStatus('connecting');

    let ticket: string | null;
    try {
      ticket = findTicket(await this.fetchMfeData());
    } catch (err) {
      this.log('[ws] Ticket fetch failed:', err instanceof Error ? err.message : err);
      this.deps.onException?.(err, { phase: 'ws_ticket_fetch' });
      this.setStatus('disconnected');
      this.scheduleReconnect();
      return;
    }

    if (!ticket) {
      this.log('[ws] No ticket found in MFE response');
      this.emit('ws_ticket_missing');
      this.setStatus('disconnected');
      this.scheduleReconnect();
      return;
    }

    this.log('[ws] Connecting, ticket:', ticket.slice(0, 8) + '...');

    const ws = this.deps.createSocket(`${WS_URL}?ticket=${ticket}`, [WS_SUBPROTOCOL], {
      Origin: BASE_URL,
      'User-Agent': SPOOF_UA,
    });
    this.ws = ws;

    ws.onopen = () => {
      this.log('[ws] Connected');
      this.reconnectDelay = 1000; // reset backoff on successful connect
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      const started = Date.now();
      this.runBootstrap()
        .then(() => {
          this.setStatus('connected');
          this.emit('ws_connected', { bootstrapMs: Date.now() - started, groupCount: this.discoveredGroups.length });
        })
        .catch((err) => {
          this.log('[ws] Bootstrap error:', err instanceof Error ? err.message : err);
          this.deps.onException?.(err, { phase: 'ws_bootstrap' });
          ws.close();
        });
    };

    ws.onmessage = (e) => this.handleMessage(e.data);

    ws.onerror = (e) => {
      this.log('[ws] Error:', e.message);
      this.deps.onException?.(new Error(e.message ?? 'socket error'), { phase: 'ws_socket' });
    };

    ws.onclose = (e) => {
      this.log(`[ws] Closed (${e.code})`);
      if (e.code !== 1000 && e.code !== 1001) this.emit('ws_closed', { code: e.code });
      // A late close from a socket we already replaced must not clobber the new one.
      if (this.ws === ws) {
        this.ws = null;
        this.setStatus('disconnected');
      }
      this.scheduleReconnect();
    };
  }

  /** Stop reconnecting and close the socket (app teardown / sign-out). */
  stop(): void {
    this.quitting = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close(1000);
    this.ws = null;
    this.setStatus('disconnected');
  }

  /** Re-push ready/groups and current playback so a freshly mounted UI catches up. */
  resync(): void {
    if (!this.isOpen) {
      // WS is down - attempt a fresh connect (re-runs bootstrap when open)
      this.connect().catch((e) => this.log('[ws] resync connect failed', e));
      return;
    }
    if (this.discoveredGroups.length === 0) return; // bootstrap hasn't completed yet
    this.deps.broadcast({ channel: 'ws:ready' });
    this.deps.broadcast({ channel: 'ws:groups', groups: this.discoveredGroups });
    // Re-subscribing makes Sonos push a fresh playbackExtended status
    this.refreshPlayback();
  }

  // ─── Commands (mirror the ipcMain handlers) ────────────────────────────────

  private command(
    namespace: string,
    command: string,
    payload: Record<string, unknown>
  ): Promise<unknown> | NotConnected {
    if (!this.isOpen) return NOT_CONNECTED;
    return this.send({ namespace, groupId: this.config.groupId, command }, payload);
  }

  play() {
    return this.command('playback', 'play', { allowTvPauseRestore: true, deviceFeedback: 'NONE' });
  }
  pause() {
    return this.command('playback', 'pause', { allowTvPauseRestore: true, deviceFeedback: 'NONE' });
  }
  skipNext() {
    return this.command('playback', 'skipToNextTrack', {});
  }
  skipPrev() {
    return this.command('playback', 'skipBack', {});
  }
  skipToTrack(trackNumber: number) {
    return this.command('playback', 'skipToTrack', { trackNumber });
  }
  seek(positionMillis: number) {
    return this.command('playback', 'seek', { positionMillis });
  }
  loadContent(payload: Record<string, unknown>) {
    return this.command('playback', 'loadContent', payload);
  }
  setPlayModes(playModes: Record<string, unknown>) {
    return this.command('playback', 'setPlayModes', { playModes });
  }
  setGroupVolume(volume: number) {
    // Number.isFinite also rejects NaN, which desktop's typeof check lets through.
    if (!Number.isFinite(volume) || volume < 0 || volume > 100) return { error: 'Invalid volume' };
    if (!this.config.groupId) return { error: 'No active group' };
    return this.command('groupVolume', 'setVolume', { volume });
  }

  /** Re-subscribing triggers Sonos to push the current playbackExtended state immediately. */
  refreshPlayback(): void {
    if (!this.isOpen) return;
    this.send({ namespace: 'playbackExtended', groupId: this.config.groupId, command: 'subscribe' }, {}).catch(
      () => {}
    );
  }

  setGroup(groupId: string): { ok: true } | { error: string } {
    const group = this.discoveredGroups.find((g) => g.id === groupId);
    if (!group) return { error: `Unknown group: ${groupId}` };
    this.config.groupId = group.id;
    this.config.queueId = group.coordinatorId;
    this.config.preferredCoordinatorId = group.coordinatorId;
    this.log(`[group] Switched to "${group.name}" - groupId: ${group.id}`);
    this.deps.onConfigChanged?.();
    if (this.isOpen) {
      // Re-subscribe so the UI immediately gets the new group's now-playing state and volume
      // rather than the previous group's last-known values.
      this.send({ namespace: 'playbackExtended', groupId: group.id, command: 'subscribe' }, {}).catch(() => {});
      this.send({ namespace: 'groupVolume', groupId: group.id, command: 'subscribe' }, {}).catch(() => {});
    }
    return { ok: true };
  }

  /** ipc 'group:getActive' - the persisted, stable preference (not the session-scoped groupId). */
  getActiveGroup(): string | null {
    return this.config.preferredCoordinatorId ?? null;
  }
}
