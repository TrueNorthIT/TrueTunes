// Sonos WebSocket (api.ws.sonos.com): connection, bootstrap, command/response and push forwarding.

import { randomUUID } from 'crypto';
import WebSocket from 'ws';
import * as telemetry from './telemetry';
import { config, state, log, broadcastToRenderers, saveConfig, BASE_URL, WS_URL, SPOOF_UA } from './state';
import { discoverServiceCredentials } from './sonos-api';

// main.ts owns the taskbar thumbnail buttons; it passes this in so this module needn't import main.
let updateThumbar: (isPlaying: boolean) => void = () => {};
export function init(deps: { updateThumbar: (isPlaying: boolean) => void }): void {
  updateThumbar = deps.updateThumbar;
}

// ─── WebSocket ────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export let ws: WebSocket | null = null;
let reconnectDelay = 1000;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let quitting = false;

// Keyed by corrId — resolves when a matching response arrives
const wsPending = new Map<string, (payload: unknown) => void>();
// Keyed by 'namespace:name' — one-shot, fired on the first matching push
const wsPushOnce = new Map<string, (payload: unknown) => void>();

export function wsSend(header: Record<string, unknown>, payload: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error('WebSocket not open'));
      return;
    }
    const corrId = randomUUID();
    const timer = setTimeout(() => {
      wsPending.delete(corrId);
      telemetry.event('ws_timeout', {
        namespace: String(header['namespace'] ?? ''),
        command: String(header['command'] ?? ''),
      });
      reject(new Error(`WS timeout: ${JSON.stringify(header)}`));
    }, 10_000);
    wsPending.set(corrId, (p) => {
      clearTimeout(timer);
      resolve(p);
    });
    const frame = [{ ...header, corrId }, payload];
    state.debugWin?.webContents.send('ws:out', frame);
    ws.send(JSON.stringify(frame));
  });
}

function handleWsMessage(raw: Buffer | string): void {
  let parsed: [Record<string, unknown>, unknown];
  try {
    parsed = JSON.parse(raw.toString()) as [Record<string, unknown>, unknown];
  } catch {
    return;
  }

  const [header, payload] = parsed;

  // Resolve a pending command response
  const corrId = header['corrId'] as string | undefined;
  if (corrId && wsPending.has(corrId)) {
    wsPending.get(corrId)!(payload);
    wsPending.delete(corrId);
  }

  // Fire one-shot push listener
  const ns = header['namespace'] as string | undefined;
  const name = (header['name'] ?? header['type']) as string | undefined;
  if (ns && name) {
    const key = `${ns}:${name}`;
    if (wsPushOnce.has(key)) {
      wsPushOnce.get(key)!(payload);
      wsPushOnce.delete(key);
    }
  }

  // Always forward to the debug monitor
  state.debugWin?.webContents.send('ws:in', [header, payload]);

  // For playbackExtended and groupVolume only forward the active group —
  // during bootstrap all subscribed groups push a status immediately, and
  // the renderer updates state unconditionally on these events, so forwarding
  // other groups' pushes would corrupt the active group's display.
  const msgGroupId = header['groupId'] as string | undefined;
  if (
    (ns === 'playbackExtended' || ns === 'groupVolume') &&
    msgGroupId &&
    config.groupId &&
    msgGroupId !== config.groupId
  ) {
    return;
  }

  if (ns === 'playbackExtended') {
    const state = (payload as Record<string, unknown> | null)?.['playback'] as Record<string, unknown> | undefined;
    if (state?.['playbackState']) {
      updateThumbar(state['playbackState'] === 'PLAYBACK_STATE_PLAYING');
    }
  }

  broadcastToRenderers('ws:message', [header, payload]);
}

// ─── WebSocket bootstrap helpers ─────────────────────────────────────────────

interface WsDevice {
  info?: { id?: string; name?: string };
  groupId?: string;
  isCoordinator?: boolean;
}

export interface GroupInfo {
  id: string; // full groupId with session (RINCON_xxx:sessionId)
  coordinatorId: string; // bare RINCON ID — used as queueId
  name: string; // room/group name
  playerIds: string[];
}

/** Live groups populated after WS bootstrap. */
export let discoveredGroups: GroupInfo[] = [];

function extractDevices(payload: unknown): {
  coordinatorGroupIds: string[];
  playerIds: string[];
  groups: GroupInfo[];
} {
  const devices: WsDevice[] = (payload as { devices?: WsDevice[] })?.devices ?? [];

  // Build a map of groupId → {coordinator, all members}
  const groupMap = new Map<string, { coordinator?: WsDevice; members: WsDevice[] }>();
  for (const d of devices) {
    if (!d.groupId) continue;
    if (!groupMap.has(d.groupId)) groupMap.set(d.groupId, { members: [] });
    const g = groupMap.get(d.groupId)!;
    g.members.push(d);
    if (d.isCoordinator) g.coordinator = d;
  }

  const coordinatorGroupIds: string[] = [];
  const playerIds: string[] = [];
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

  // Deduplicate player IDs across all groups
  const seen = new Set<string>();
  for (const d of devices) {
    if (d.info?.id && !seen.has(d.info.id)) {
      seen.add(d.info.id);
      playerIds.push(d.info.id);
    }
  }

  return { coordinatorGroupIds, playerIds, groups };
}

/** Deep-search an arbitrary JSON object for the WebSocket ticket UUID. */
function findTicket(obj: unknown, depth = 0): string | null {
  if (depth > 10 || obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const hit = findTicket(item, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof obj === 'object') {
    const rec = obj as Record<string, unknown>;
    // Prefer keys that look like 'ticket'
    for (const [key, val] of Object.entries(rec)) {
      if (key.toLowerCase().includes('ticket') && typeof val === 'string' && UUID_RE.test(val)) {
        return val;
      }
    }
    for (const val of Object.values(rec)) {
      const hit = findTicket(val, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

/** Fetch /api/mfe directly from the main process using the captured session cookie. */
async function fetchMfeData(): Promise<unknown> {
  if (!state.sessionToken) throw new Error('No session token');
  const res = await fetch(`${BASE_URL}/api/mfe`, {
    headers: {
      Cookie: `__Secure-next-auth.session-token=${state.sessionToken}`,
      'User-Agent': SPOOF_UA,
      Accept: '*/*',
      Referer: `${BASE_URL}/en-us/web-app`,
    },
  });
  if (!res.ok) throw new Error(`MFE fetch ${res.status}`);
  return res.json();
}

// ─── WebSocket bootstrap sequence ────────────────────────────────────────────

async function runBootstrap(): Promise<void> {
  log('[ws] Bootstrap start');

  // 1 ─ Get households (confirms connection, gives live householdId)
  const householdsResp = await wsSend({ command: 'getHouseholds', namespace: 'households' }, { connectedOnly: 'true' });
  const households = (householdsResp as { households?: Array<{ id: string }> })?.households ?? [];
  const householdId = households[0]?.id ?? config.householdId;
  config.householdId = householdId;
  log('[ws] Household:', householdId);

  // 1b ─ Discover serviceId/accountId if not already in config
  await discoverServiceCredentials();

  // 2 ─ Subscribe to devices; the immediate push carries the full topology
  const devicesPayload = await new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('devices push timeout')), 10_000);
    wsPushOnce.set('devices:devicesStatus', (p) => {
      clearTimeout(timer);
      resolve(p);
    });
    wsSend({ namespace: 'devices', householdId, command: 'subscribe' }, {}).catch(reject);
  });

  const { coordinatorGroupIds, playerIds, groups } = extractDevices(devicesPayload);
  log(`[ws] ${coordinatorGroupIds.length} coordinator group(s), ${playerIds.length} player(s)`);
  groups.forEach((g) => log(`[ws]   group "${g.name}" — ${g.id}`));

  // Update live group list. Restore saved group preference (matched by stable
  // coordinatorId) if it exists in the current household; otherwise fall back
  // to the first group and persist that as the new preference.
  discoveredGroups = groups;
  if (groups.length > 0) {
    const savedGroup = config.preferredCoordinatorId
      ? groups.find((g) => g.coordinatorId === config.preferredCoordinatorId)
      : null;
    const activeGroup = savedGroup ?? groups[0];
    config.groupId = activeGroup.id;
    if (!savedGroup) {
      config.preferredCoordinatorId = activeGroup.coordinatorId;
      void saveConfig();
    }
    log(`[ws] Active group: "${activeGroup.name}" (${activeGroup.id})`);
  }

  // 3 ─ Subscribe to playbackExtended first so we can capture initial state
  const pbSubResults = await Promise.all(
    coordinatorGroupIds.map((groupId) =>
      wsSend({ namespace: 'playbackExtended', groupId, command: 'subscribe' }, {})
        .then((resp) => ({ groupId, resp }))
        .catch(() => null)
    )
  );

  // 4 ─ Subscribe to groupVolume (capture responses so we can seed the renderer
  //     with the active group's initial volume) and player-level hardware.
  const [volSubResults] = await Promise.all([
    Promise.all(
      coordinatorGroupIds.map((groupId) =>
        wsSend({ namespace: 'groupVolume', groupId, command: 'subscribe' }, {})
          .then((resp) => ({ groupId, resp }))
          .catch(() => null)
      )
    ),
    ...playerIds.flatMap((playerId) => [
      wsSend({ namespace: 'playerVolume', playerId, command: 'subscribe' }, {}),
      wsSend({ namespace: 'hardwareStatus', playerId, command: 'subscribe' }, {}),
    ]),
  ]);

  // Notify renderer: WS is ready + send group list
  broadcastToRenderers('ws:ready');
  broadcastToRenderers('ws:groups', groups);

  // Forward initial playback state for the active group only.
  const activeResult = pbSubResults.find((r) => r?.groupId === config.groupId);
  if (activeResult?.resp) {
    broadcastToRenderers('ws:message', [
      { namespace: 'playbackExtended', groupId: activeResult.groupId },
      activeResult.resp,
    ]);
  }

  // Forward the active group's initial volume — the raw subscribe response
  // arrives before the renderer has registered its ws:message listener, so
  // re-broadcast it here (same pattern as playbackExtended above).
  const activeVol = volSubResults.find((r) => r?.groupId === config.groupId);
  if (activeVol?.resp) {
    broadcastToRenderers('ws:message', [{ namespace: 'groupVolume', groupId: activeVol.groupId }, activeVol.resp]);
  }

  log('[ws] Bootstrap complete');
}

// ─── WebSocket lifecycle ──────────────────────────────────────────────────────

function scheduleReconnect(): void {
  if (quitting) return;
  if (reconnectTimer) return; // already pending
  log(`[ws] Reconnecting in ${reconnectDelay / 1000}s`);
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
    await connectWebSocket();
  }, reconnectDelay);
}

export async function connectWebSocket(): Promise<void> {
  // Guard against double-connect
  if (ws && ws.readyState <= WebSocket.OPEN) return;

  // Fetch a fresh ticket from /api/mfe
  let ticket: string | null = null;
  try {
    ticket = findTicket(await fetchMfeData());
  } catch (err) {
    console.error('[ws] Ticket fetch failed:', err instanceof Error ? err.message : err);
    telemetry.exception(err, { phase: 'ws_ticket_fetch' });
    scheduleReconnect();
    return;
  }

  if (!ticket) {
    console.error('[ws] No ticket found in MFE response');
    telemetry.event('ws_ticket_missing');
    scheduleReconnect();
    return;
  }

  log('[ws] Connecting, ticket:', ticket.slice(0, 8) + '…');

  ws = new WebSocket(`${WS_URL}?ticket=${ticket}`, ['v1.api.smartspeaker.audio'], {
    headers: { Origin: BASE_URL, 'User-Agent': SPOOF_UA },
  });

  ws.on('open', () => {
    log('[ws] Connected');
    reconnectDelay = 1000; // reset backoff on successful connect
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    const bootstrapStart = Date.now();
    runBootstrap()
      .then(() => {
        telemetry.event('ws_connected', {
          bootstrapMs: Date.now() - bootstrapStart,
          groupCount: discoveredGroups.length,
        });
        if (config.groupId) telemetry.setContext({ groupId: config.groupId });
      })
      .catch((err) => {
        console.error('[ws] Bootstrap error:', err instanceof Error ? err.message : err);
        telemetry.exception(err, { phase: 'ws_bootstrap' });
        ws?.close();
      });
  });

  ws.on('message', handleWsMessage);

  ws.on('error', (err) => {
    console.error('[ws] Error:', err.message);
    telemetry.exception(err, { phase: 'ws_socket' });
  });

  ws.on('close', (code) => {
    log(`[ws] Closed (${code})`);
    if (code !== 1000 && code !== 1001) {
      telemetry.event('ws_closed', { code });
    }
    ws = null;
    scheduleReconnect();
  });
}

/** Re-push ws:ready, ws:groups, and current playback state to the renderer.
 *  Called on did-finish-load (page refresh) and via the resync IPC handler. */
export function resyncRendererState(): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    // WS is down — attempt a fresh connect (will re-run bootstrap when open)
    connectWebSocket().catch(console.error);
    return;
  }
  if (discoveredGroups.length === 0) return; // bootstrap hasn't completed yet
  broadcastToRenderers('ws:ready');
  broadcastToRenderers('ws:groups', discoveredGroups);
  // Re-subscribing triggers Sonos to push a fresh playbackExtended status
  const groupId = config.groupId;
  if (groupId) {
    wsSend({ namespace: 'playbackExtended', groupId, command: 'subscribe' }, {}).catch(() => {});
  }
  log('[ws] Renderer resynced');
}

/** Stop reconnecting and drop the socket (app quit). */
export function stopWebSocket(): void {
  quitting = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  ws?.terminate();
}
