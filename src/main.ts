import { app, BrowserWindow, ipcMain, safeStorage, session, Menu, IpcMainInvokeEvent } from 'electron';
import { autoUpdater } from 'electron-updater';
import { officePubSub } from './pubsub';
import * as path from 'path';
import * as fs from 'fs/promises';
import { randomUUID } from 'crypto';
import WebSocket from 'ws';
import type { FetchRequest, FetchResponse } from './types';
import * as telemetry from './telemetry';

// ─── Config ──────────────────────────────────────────────────────────────────

/** Music service credentials (persisted to userData/config.json) plus
 *  runtime identifiers discovered during each session. */
interface AppConfig {
  /** Primary music service ID — auto-discovered from play.sonos.com requests. */
  serviceId?: string;
  /** Primary music service account ID — auto-discovered. */
  accountId?: string;
  /** Household ID — re-discovered on each WS bootstrap. */
  householdId?: string;
  /** Active group ID — re-discovered on each WS bootstrap, updated on group switch. */
  groupId?: string;
  /** Active queue ID (coordinator player ID) — kept in sync by the renderer. */
  queueId?: string;
  /** Display name shown on tracks this user adds to the queue. */
  displayName?: string;
}

// YouTube Music service constants used for the nowPlaying fallback lookup.
// These are generic Sonos platform IDs, not user-specific.
const SEARCH_SERVICE_ID = '72711';
const SEARCH_ACCOUNT_ID = '13';

// Sonos platform-level service/account IDs used for queue, favorites, and
// history endpoints.  These are fixed for the platform — not user-specific.
const PLATFORM_SERVICE_ID = '16751367';
const PLATFORM_ACCOUNT_ID = '123209393';

const PUBSUB_FUNCTION_URL = 'https://truetunes-fn.azurewebsites.net';

const config: AppConfig = {};

function configFilePath(): string {
  return path.join(app.getPath('userData'), 'config.json');
}

async function loadConfig(): Promise<void> {
  try {
    const raw = await fs.readFile(configFilePath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    // Only load the fields we explicitly persist (not runtime-discovered ones)
    if (typeof parsed.displayName === 'string') config.displayName = parsed.displayName;
  } catch {
    // No config file yet — use defaults
  }
}

async function saveConfig(): Promise<void> {
  try {
    // Only persist non-sensitive, user-set fields
    const toSave: Partial<AppConfig> = {
      displayName: config.displayName,
    };
    await fs.writeFile(configFilePath(), JSON.stringify(toSave, null, 2), 'utf8');
  } catch (err) {
    console.warn('[config] Failed to save:', err);
  }
}

// ─── Session token storage ────────────────────────────────────────────────────

function sessionFilePath(): string {
  return path.join(app.getPath('userData'), 'session.enc');
}

async function saveSessionToken(token: string): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) return;
  try {
    const enc = safeStorage.encryptString(token);
    await fs.writeFile(sessionFilePath(), enc);
  } catch {
    /* ignore */
  }
}

async function loadSessionToken(): Promise<string | null> {
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const enc = await fs.readFile(sessionFilePath());
    return safeStorage.decryptString(enc);
  } catch {
    return null;
  }
}

async function clearSessionToken(): Promise<void> {
  try {
    await fs.unlink(sessionFilePath());
  } catch {
    /* ignore */
  }
}

async function validateSessionToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/mfe`, {
      headers: {
        Cookie: `__Secure-next-auth.session-token=${token}`,
        'User-Agent': SPOOF_UA,
        Accept: '*/*',
        Referer: `${BASE_URL}/en-us/web-app`,
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Dev logging ─────────────────────────────────────────────────────────────

// Suppress verbose logs in production builds; errors always surface.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const log = (...args: any[]) => {
  if (!app.isPackaged) console.log(...args);
};

const BASE_URL = 'https://play.sonos.com';
const WS_URL = 'wss://api.ws.sonos.com/websocket';

// Intentional UA spoof — Sonos BFF rejects non-browser agents.
const SPOOF_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

// ─── Operation registry ───────────────────────────────────────────────────────

type HttpMethod = 'GET' | 'POST' | 'DELETE' | 'PATCH';

interface Operation {
  method: HttpMethod;
  path: string;
}

const OPERATIONS: Record<string, Operation> = {
  // Auth
  getAuthDiscovery: { method: 'GET', path: '/api/authz/discovery' },
  // Groups
  getGroups: {
    method: 'GET',
    path: '/api/groups/v1/households/:householdId/groups',
  },
  // Queue — uses platform-level service IDs, not the user's integration service ID.
  getQueueResources: {
    method: 'GET',
    path: '/api/content/v1/groups/:groupId/services/:platformServiceId/accounts/:platformAccountId/queues/:queueId/resources',
  },
  addQueueResource: {
    method: 'POST',
    path: '/api/content/v1/groups/:groupId/services/:platformServiceId/accounts/:platformAccountId/queues/:queueId/resources',
  },
  deleteQueueResources: {
    method: 'DELETE',
    path: '/api/content/v1/groups/:groupId/services/:platformServiceId/accounts/:platformAccountId/queues/:queueId/resources',
  },
  reorderQueueResources: {
    method: 'PATCH',
    path: '/api/content/v1/groups/:groupId/services/:platformServiceId/accounts/:platformAccountId/queues/:queueId/resources',
  },
  // Browse
  browseAlbum: {
    method: 'GET',
    path: '/api/content/v2/households/:householdId/services/:serviceId/accounts/:accountId/albums/:albumId/browse',
  },
  browseArtist: {
    method: 'GET',
    path: '/api/content/v2/households/:householdId/services/:serviceId/accounts/:accountId/artists/:artistId/browse',
  },
  browseContainer: {
    method: 'GET',
    path: '/api/content/v2/households/:householdId/services/:serviceId/accounts/:accountId/containers/:containerId/browse',
  },
  browsePlaylist: {
    method: 'GET',
    path: '/api/content/v2/households/:householdId/services/:serviceId/accounts/:accountId/playlists/:playlistId/browse',
  },
  getCatalogContainerResources: {
    method: 'GET',
    path: '/api/content/v1/households/:householdId/services/:serviceId/accounts/:accountId/catalog/containers/:containerId/resources',
  },
  // Favorites & History — use platform-level IDs, not integration service IDs
  getFavoriteResources: {
    method: 'GET',
    path: '/api/content/v1/households/:householdId/services/:platformServiceId/accounts/:platformAccountId/favorites/resources',
  },
  getHistory: {
    method: 'GET',
    path: '/api/content/v1/households/:householdId/services/:platformServiceId/accounts/:platformAccountId/history',
  },
  // Search
  searchHousehold: {
    method: 'GET',
    path: '/api/content/v1/households/:householdId/search',
  },
  searchService: {
    method: 'GET',
    path: '/api/content/v1/households/:householdId/services/:searchServiceId/accounts/:searchAccountId/search',
  },
  // Integrations
  getIntegrations: {
    method: 'GET',
    path: '/api/content/v1/households/:householdId/integrations',
  },
  getIntegrationRegistrations: {
    method: 'GET',
    path: '/api/content/v1/households/:householdId/integrations/registrations',
  },
  // Now Playing
  getTrackNowPlaying: {
    method: 'GET',
    path: '/api/content/v2/households/:householdId/services/:serviceId/accounts/:accountId/tracks/:trackId/nowplaying',
  },
  // Playback (BFF paths — verify by intercepting traffic)
  getPlaybackState: { method: 'GET', path: '/api/playback/v1/groups/:groupId' },
  play: { method: 'POST', path: '/api/playback/v1/groups/:groupId/play' },
  pause: { method: 'POST', path: '/api/playback/v1/groups/:groupId/pause' },
  skipToNextTrack: {
    method: 'POST',
    path: '/api/playback/v1/groups/:groupId/skipToNextTrack',
  },
  skipToPreviousTrack: {
    method: 'POST',
    path: '/api/playback/v1/groups/:groupId/skipToPreviousTrack',
  },
  setPlayMode: {
    method: 'POST',
    path: '/api/playback/v1/groups/:groupId/playMode',
  },
  seek: {
    method: 'POST',
    path: '/api/playback/v1/groups/:groupId/seek',
  },
  // Platform
  getMfe: { method: 'GET', path: '/api/mfe' },
  getOptimizelyConfig: { method: 'GET', path: '/api/optimizely/:key' },
  postMetrics: { method: 'POST', path: '/api/metrics' },
};

// ─── URL builder ──────────────────────────────────────────────────────────────

function buildUrl(
  operationPath: string,
  pathParams: Record<string, string> = {},
  query: Record<string, string | undefined> = {}
): string {
  const configDefaults: Record<string, string> = {};
  if (config.householdId) configDefaults['householdId'] = config.householdId;
  if (config.serviceId) configDefaults['serviceId'] = config.serviceId;
  if (config.accountId) configDefaults['accountId'] = config.accountId;
  configDefaults['searchServiceId'] = SEARCH_SERVICE_ID;
  configDefaults['searchAccountId'] = SEARCH_ACCOUNT_ID;
  configDefaults['platformServiceId'] = PLATFORM_SERVICE_ID;
  configDefaults['platformAccountId'] = PLATFORM_ACCOUNT_ID;
  if (config.groupId) configDefaults['groupId'] = config.groupId;
  if (config.queueId) configDefaults['queueId'] = config.queueId;

  const params: Record<string, string> = { ...configDefaults, ...pathParams };

  const urlPath = operationPath.replace(/:([a-zA-Z]+)/g, (_, key: string) => {
    if (!(key in params)) throw new Error(`Missing path param: ${key}`);
    return encodeURIComponent(params[key]);
  });

  const qs = Object.entries(query)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  return `${BASE_URL}${urlPath}${qs ? `?${qs}` : ''}`;
}

// ─── HTTP fetch helper ────────────────────────────────────────────────────────

async function sonosFetch(request: FetchRequest): Promise<FetchResponse> {
  if (!sessionToken) {
    return { error: 'No session token — please log in first' };
  }

  const operation = OPERATIONS[request.operationId];
  if (!operation) {
    return { error: `Unknown operation: ${request.operationId}` };
  }

  let url: string;
  try {
    url = buildUrl(operation.path, request.pathParams, request.query);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // If the only missing param is serviceId, attempt on-demand discovery and retry once
    if (msg.includes('serviceId') && !config.serviceId) {
      log('[api] serviceId missing — attempting on-demand discovery before retrying');
      await discoverServiceCredentials();
      try {
        url = buildUrl(operation.path, request.pathParams, request.query);
      } catch (retryErr) {
        return { error: retryErr instanceof Error ? retryErr.message : String(retryErr) };
      }
    } else {
      return { error: msg };
    }
  }

  // Build headers once so we can log them before sending
  const reqHeaders: Record<string, string> = {
    Cookie: `__Secure-next-auth.session-token=${sessionToken}`,
    'X-Sonos-Timezone': '+01:00',
    'X-Sonos-Debug': 'use-section-text=true',
    Accept: '*/*',
    Referer: `${BASE_URL}/en-us/web-app`,
    'User-Agent': SPOOF_UA,
    ...(request.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...request.headers,
  };

  const reqId = randomUUID();
  const startTs = Date.now();

  httpDebugWin?.webContents.send('http:req', {
    id: reqId,
    ts: startTs,
    operationId: request.operationId,
    method: operation.method,
    url,
    headers: reqHeaders,
    body: request.body !== undefined ? JSON.stringify(request.body) : undefined,
  });

  log(`[api] ${operation.method} ${url}`);

  let response: Response;
  try {
    response = await fetch(url, {
      method: operation.method,
      headers: reqHeaders,
      ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
    });
  } catch (err) {
    const errorMsg = `Fetch failed: ${err instanceof Error ? err.message : String(err)}`;
    httpDebugWin?.webContents.send('http:res', {
      id: reqId,
      status: 0,
      statusText: 'Network Error',
      headers: {},
      body: errorMsg,
      durationMs: Date.now() - startTs,
    });
    return { error: errorMsg };
  }

  // Read as text once — used for both debug window and response parsing
  const resHeaders: Record<string, string> = {};
  response.headers.forEach((val: string, key: string) => {
    resHeaders[key] = val;
  });
  let bodyText = '';
  try {
    bodyText = await response.text();
  } catch {
    /* ignore */
  }

  httpDebugWin?.webContents.send('http:res', {
    id: reqId,
    status: response.status,
    statusText: response.statusText,
    headers: resHeaders,
    body: bodyText,
    durationMs: Date.now() - startTs,
  });

  if (response.status === 401) {
    log('[api] 401 — auth expired, re-showing auth window');
    telemetry.event('auth_expired', { operationId: request.operationId });
    authConfirmed = false;
    sessionToken = null;
    void clearSessionToken();
    broadcastToRenderers('auth:expired');
    if (authWin) {
      authWin.show();
    } else {
      createAuthWindow();
    }
    return { error: '401 Unauthorized — re-authenticating' };
  }

  if (!response.ok) {
    console.error(`[api] ${response.status} ${response.statusText} — ${url}\n${bodyText.slice(0, 500)}`);
    telemetry.event('api_error', { operationId: request.operationId, statusCode: response.status });
    return {
      error: `${response.status} ${response.statusText}${bodyText ? `: ${bodyText.slice(0, 200)}` : ''}`,
    };
  }

  const etag = resHeaders['etag'] ?? resHeaders['ETag'];

  if (!bodyText) return { data: null, ...(etag ? { etag } : {}) };

  try {
    return { data: JSON.parse(bodyText), ...(etag ? { etag } : {}) };
  } catch {
    return { error: `Response is not JSON (${response.status} ${response.statusText})` };
  }
}

// ─── WebSocket ────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let ws: WebSocket | null = null;
let reconnectDelay = 1000;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let quitting = false;

// Keyed by corrId — resolves when a matching response arrives
const wsPending = new Map<string, (payload: unknown) => void>();
// Keyed by 'namespace:name' — one-shot, fired on the first matching push
const wsPushOnce = new Map<string, (payload: unknown) => void>();

function wsSend(header: Record<string, unknown>, payload: Record<string, unknown>): Promise<unknown> {
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
        command:   String(header['command']   ?? ''),
      });
      reject(new Error(`WS timeout: ${JSON.stringify(header)}`));
    }, 10_000);
    wsPending.set(corrId, (p) => {
      clearTimeout(timer);
      resolve(p);
    });
    const frame = [{ ...header, corrId }, payload];
    debugWin?.webContents.send('ws:out', frame);
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
  debugWin?.webContents.send('ws:in', [header, payload]);

  // For playbackExtended only forward the active group — during bootstrap all
  // subscribed groups push a status immediately, and the renderer's
  // activeGroupIdRef is still null so the last push wins (wrong group).
  const msgGroupId = header['groupId'] as string | undefined;
  if (ns === 'playbackExtended' && msgGroupId && config.groupId && msgGroupId !== config.groupId) {
    return;
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
let discoveredGroups: GroupInfo[] = [];

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
  if (!sessionToken) throw new Error('No session token');
  const res = await fetch(`${BASE_URL}/api/mfe`, {
    headers: {
      Cookie: `__Secure-next-auth.session-token=${sessionToken}`,
      'User-Agent': SPOOF_UA,
      Accept: '*/*',
      Referer: `${BASE_URL}/en-us/web-app`,
    },
  });
  if (!res.ok) throw new Error(`MFE fetch ${res.status}`);
  return res.json();
}

// ─── Service credential discovery ────────────────────────────────────────────

interface ServiceCreds {
  serviceId: string;
  accountId: string;
}

/** Parse a flat array of integration objects (keys may be camelCase OR
 *  hyphenated as the Sonos API returns them). Returns all found pairs. */
function parseIntegrationsCreds(data: unknown): ServiceCreds[] {
  const items = Array.isArray(data) ? data : data !== null && typeof data === 'object' ? [data] : [];
  const results: ServiceCreds[] = [];
  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue;
    const rec = item as Record<string, unknown>;
    // Sonos returns hyphenated keys: service-id, account-id
    const sid = rec['service-id'] ?? rec['serviceId'];
    const aid = rec['account-id'] ?? rec['accountId'];
    if ((typeof sid === 'string' || typeof sid === 'number') && (typeof aid === 'string' || typeof aid === 'number')) {
      results.push({ serviceId: String(sid), accountId: String(aid) });
    }
  }
  return results;
}

/** Called after bootstrap (and lazily from sonosFetch) when serviceId isn't
 *  in config. Uses /integrations/registrations (only needs householdId).
 *  Coalesces concurrent callers onto a single in-flight request. */
let _discoverInFlight: Promise<void> | null = null;
function discoverServiceCredentials(): Promise<void> {
  if (config.serviceId) return Promise.resolve();
  if (_discoverInFlight) return _discoverInFlight;
  _discoverInFlight = (async () => {
    try {
      const r = await sonosFetch({ operationId: 'getIntegrationRegistrations' });
      if (r.error || !r.data) {
        log('[config] getIntegrationRegistrations failed:', r.error);
        return;
      }

      const allCreds = parseIntegrationsCreds(r.data);
      log(
        '[config] Found services:',
        allCreds.map((c) => `${c.serviceId}/${c.accountId}`)
      );

      // Use the first service the API returns — Sonos places the primary
      // content service first (the one that owns the user's queue, favorites,
      // and history).
      const primary = allCreds[0];
      if (primary) {
        config.serviceId = primary.serviceId;
        config.accountId = primary.accountId;
        saveConfig();
        log('[config] Using serviceId:', config.serviceId, 'accountId:', config.accountId);
      } else {
        log('[config] No service credentials found — content APIs will fail until configured');
      }
    } finally {
      _discoverInFlight = null;
    }
  })();
  return _discoverInFlight;
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

  // Update live group list and set the first group as active
  discoveredGroups = groups;
  if (groups.length > 0) {
    config.groupId = groups[0].id;
    log(`[ws] Active group: "${groups[0].name}" (${groups[0].id})`);
  }

  // 3 ─ Subscribe to playbackExtended first so we can capture initial state
  const pbSubResults = await Promise.all(
    coordinatorGroupIds.map((groupId) =>
      wsSend({ namespace: 'playbackExtended', groupId, command: 'subscribe' }, {})
        .then((resp) => ({ groupId, resp }))
        .catch(() => null)
    )
  );

  // 4 ─ Subscribe to volume / hardware (fire-and-forget)
  await Promise.all([
    ...coordinatorGroupIds.map((groupId) => wsSend({ namespace: 'groupVolume', groupId, command: 'subscribe' }, {})),
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

async function connectWebSocket(): Promise<void> {
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
          groupCount:  discoveredGroups.length,
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

// ─── App windows ──────────────────────────────────────────────────────────────

let sessionToken: string | null = null;
let authWin: BrowserWindow | null = null;
let uiWin: BrowserWindow | null = null;
let miniWin: BrowserWindow | null = null;
let debugWin: BrowserWindow | null = null;
let httpDebugWin: BrowserWindow | null = null;
let authConfirmed = false; // prevents onAuthReady firing on every /api/content/ 200

/** Send a channel/args pair to all live renderer windows (main + mini player). */
function broadcastToRenderers(channel: string, ...args: unknown[]): void {
  uiWin?.webContents.send(channel, ...args);
  if (miniWin && !miniWin.isDestroyed()) miniWin.webContents.send(channel, ...args);
}

function openDebugWindow(): void {
  if (app.isPackaged) return;
  if (debugWin && !debugWin.isDestroyed()) {
    debugWin.focus();
    return;
  }
  debugWin = new BrowserWindow({
    width: 960,
    height: 700,
    title: 'WS Monitor',
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  debugWin.loadFile(path.join(__dirname, 'debug-ws.html'));
  debugWin.on('closed', () => {
    debugWin = null;
  });
}

function openHttpDebugWindow(): void {
  if (app.isPackaged) return;
  if (httpDebugWin && !httpDebugWin.isDestroyed()) {
    httpDebugWin.focus();
    return;
  }
  httpDebugWin = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'HTTP Monitor',
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  httpDebugWin.loadFile(path.join(__dirname, 'debug-http.html'));
  httpDebugWin.on('closed', () => {
    httpDebugWin = null;
  });
}

function createAuthWindow(): void {
  authWin = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  authWin.loadURL(`${BASE_URL}`);

  // Spoof UA and capture session cookie on all play.sonos.com requests
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: [`${BASE_URL}/*`] }, (details, callback) => {
    const headers = { ...details.requestHeaders };
    headers['User-Agent'] = SPOOF_UA;

    const cookieHeader = headers['Cookie'] ?? headers['cookie'] ?? '';
    const match = cookieHeader.match(/__Secure-next-auth\.session-token=([^;]+)/);
    if (match) {
      const token = match[1];
      if (token !== sessionToken) {
        sessionToken = token;
        void saveSessionToken(token);
        log('[auth] Session token captured:', token.slice(0, 20) + '…');
      }
    }

    // Auto-discover serviceId/accountId from content API URLs the first time
    if (!config.serviceId) {
      const svcMatch = details.url.match(/\/services\/([^/]+)\/accounts\/([^/]+)\//);
      if (svcMatch && svcMatch[1] !== SEARCH_SERVICE_ID) {
        config.serviceId = svcMatch[1];
        config.accountId = svcMatch[2];
        log('[config] Discovered serviceId:', config.serviceId, 'accountId:', config.accountId);
        saveConfig();
      }
    }

    callback({ requestHeaders: headers });
  });

  // A successful /api/content/ response confirms the session is live
  session.defaultSession.webRequest.onCompleted({ urls: [`${BASE_URL}/api/content/*`] }, (details) => {
    if (details.statusCode === 200 && authWin) {
      log('[auth] /api/content/ 200 — auth confirmed');
      onAuthReady();
    }
  });

  // Inject CORS headers for two cases:
  //  1. Local Sonos devices — plain HTTP, RFC 1918 addresses
  //  2. External image CDNs (gstatic, ytimg, music.youtube.com) that don't
  //     send Access-Control-Allow-Origin, blocking the renderer's fetch().
  const IMAGE_CDN =
    /^https:\/\/(www\.gstatic\.com|music\.youtube\.com|i\.ytimg\.com|yt3\.googleusercontent\.com|lh3\.googleusercontent\.com)\//;
  session.defaultSession.webRequest.onHeadersReceived(
    {
      urls: [
        'http://*/*',
        'https://www.gstatic.com/*',
        'https://music.youtube.com/*',
        'https://i.ytimg.com/*',
        'https://yt3.googleusercontent.com/*',
        'https://lh3.googleusercontent.com/*',
      ],
    },
    (details, callback) => {
      const isLan = /^http:\/\/(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(details.url);
      const isCdn = IMAGE_CDN.test(details.url);
      if (!isLan && !isCdn) {
        callback({});
        return;
      }
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'access-control-allow-origin': ['*'],
        },
      });
    }
  );
}

/** Initialise Azure PubSub if a Function URL and display name are configured. */
async function initPubSub(): Promise<void> {
  if (!PUBSUB_FUNCTION_URL || !config.displayName) return;
  try {
    const initialMap = await officePubSub.connect(config.displayName, PUBSUB_FUNCTION_URL);
    broadcastToRenderers('attribution:map', initialMap);
    officePubSub.onEvent((event) => {
      broadcastToRenderers('attribution:event', event);
    });
    log('[pubsub] Connected as', config.displayName);
  } catch (err) {
    console.warn('[pubsub] Failed to connect:', (err as Error).message);
    telemetry.exception(err, { phase: 'pubsub_connect' });
  }
}

function onAuthReady(): void {
  if (authConfirmed) return; // fire only once per login
  authConfirmed = true;
  telemetry.event('auth_success');

  authWin?.hide();

  if (!uiWin) {
    createUIWindow();
  } else {
    uiWin.show();
    broadcastToRenderers('auth:ready');
  }

  connectWebSocket().catch(console.error);
  initPubSub().catch(console.error);
}

function createUIWindow(): void {
  uiWin = new BrowserWindow({
    width: 960,
    height: 640,
    title: `True-Tunes v${app.getVersion()}`,
    backgroundColor: '#1c1c1e',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (app.isPackaged) {
    uiWin.loadFile(path.join(__dirname, '..', 'renderer', 'dist', 'index.html'));
  } else {
    uiWin.loadURL('http://localhost:5173');
  }

  uiWin.webContents.on('did-finish-load', () => {
    if (authConfirmed) {
      broadcastToRenderers('auth:ready');
      resyncRendererState();
    }
  });
}

function createMiniPlayerWindow(): void {
  if (miniWin && !miniWin.isDestroyed()) {
    miniWin.focus();
    return;
  }

  miniWin = new BrowserWindow({
    width: 340,
    height: 104,
    minWidth: 340,
    minHeight: 104,
    maxWidth: 340,
    maxHeight: 104,
    frame: false,
    transparent: true,
    backgroundColor: '#00ffffff',
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
    },
  });

  if (app.isPackaged) {
    miniWin.loadFile(path.join(__dirname, '..', 'renderer', 'dist', 'index.html'), { hash: '/mini' });
  } else {
    miniWin.loadURL('http://localhost:5173/#/mini');
  }

  miniWin.webContents.on('did-finish-load', () => {
    if (!miniWin || miniWin.isDestroyed()) return;
    if (authConfirmed) {
      miniWin.webContents.send('auth:ready');
    }
    // Push current WS state without triggering a full re-subscribe
    if (discoveredGroups.length > 0) {
      miniWin.webContents.send('ws:ready');
      miniWin.webContents.send('ws:groups', discoveredGroups);
      // Re-subscribe to get a fresh playback push just for the mini window
      const groupId = config.groupId;
      if (groupId && ws && ws.readyState === WebSocket.OPEN) {
        wsSend({ namespace: 'playbackExtended', groupId, command: 'subscribe' }, {}).catch(() => {});
      }
    }
  });

  miniWin.on('closed', () => {
    miniWin = null;
  });
}

// ─── IPC ──────────────────────────────────────────────────────────────────────

ipcMain.handle('api:fetch', async (_event: IpcMainInvokeEvent, request: FetchRequest): Promise<FetchResponse> => {
  return sonosFetch(request);
});

ipcMain.handle('volume:group:set', (_event: IpcMainInvokeEvent, volume: number) => {
  if (typeof volume !== 'number' || volume < 0 || volume > 100) return { error: 'Invalid volume' };
  const groupId = config.groupId;
  if (!groupId) return { error: 'No active group' };
  if (!ws || ws.readyState !== WebSocket.OPEN) return { error: 'WS not connected' };
  return wsSend({ namespace: 'groupVolume', groupId, command: 'setVolume' }, { volume });
});

ipcMain.handle('playback:play', (_event: IpcMainInvokeEvent) => {
  const groupId = config.groupId;
  if (!ws || ws.readyState !== WebSocket.OPEN) return { error: 'WS not connected' };
  return wsSend(
    { namespace: 'playback', groupId, command: 'play' },
    { allowTvPauseRestore: true, deviceFeedback: 'NONE' }
  );
});

ipcMain.handle('playback:pause', (_event: IpcMainInvokeEvent) => {
  const groupId = config.groupId;
  if (!ws || ws.readyState !== WebSocket.OPEN) return { error: 'WS not connected' };
  return wsSend(
    { namespace: 'playback', groupId, command: 'pause' },
    { allowTvPauseRestore: true, deviceFeedback: 'NONE' }
  );
});

ipcMain.handle('debug:openWsMonitor', () => openDebugWindow());
ipcMain.handle('debug:openHttpMonitor', () => openHttpDebugWindow());

ipcMain.handle('app:version', () => app.getVersion());

ipcMain.handle('config:getDisplayName', () => config.displayName ?? null);

ipcMain.handle('config:setDisplayName', async (_: IpcMainInvokeEvent, name: string) => {
  config.displayName = name;
  telemetry.setContext({ userId: name });
  await saveConfig();
  // Start pubsub now that we have a name (first-time setup path)
  initPubSub().catch(console.error);
});

ipcMain.handle('telemetry:event', (_: IpcMainInvokeEvent, name: string, props?: Record<string, string>) => {
  telemetry.event(name, props);
});

ipcMain.handle(
  'pubsub:publishQueued',
  async (_: IpcMainInvokeEvent, item: { uri: string; trackName: string; artist: string; artistId?: string; album?: string; albumId?: string; imageUrl?: string }) => {
    await officePubSub.publishQueued(item).catch(() => {
      /* silent */
    });
    // Broadcast the local user's own attribution back to renderers (noEcho means
    // the WS won't echo it back, so we push it manually).
    const event = {
      type: 'queued' as const,
      user: config.displayName ?? '',
      uri: item.uri,
      trackName: item.trackName,
      artist: item.artist,
      artistId: item.artistId,
      album: item.album,
      albumId: item.albumId,
      imageUrl: item.imageUrl,
      timestamp: Date.now(),
    };
    broadcastToRenderers('attribution:event', event);
  }
);

ipcMain.handle('stats:fetch', async (_: IpcMainInvokeEvent, period: string, userId?: string) => {
  try {
    let url = `${PUBSUB_FUNCTION_URL}/api/stats?period=${encodeURIComponent(period)}`;
    if (userId) url += `&userId=${encodeURIComponent(userId)}`;
    const res = await fetch(url);
    return await res.json();
  } catch (err) {
    return { error: String(err) };
  }
});

ipcMain.handle('attribution:refresh', async () => {
  try {
    const map = await officePubSub.refresh();
    broadcastToRenderers('attribution:map', map);
  } catch {
    /* silent — pubsub not configured */
  }
});

ipcMain.handle('mini:open', () => createMiniPlayerWindow());
ipcMain.handle('mini:close', () => {
  miniWin?.close();
  miniWin = null;
});

ipcMain.handle(
  'http:resend',
  async (
    _event: IpcMainInvokeEvent,
    req: { method: string; url: string; headers: Record<string, string>; body?: string }
  ) => {
    const startTs = Date.now();
    try {
      const response = await fetch(req.url, {
        method: req.method,
        headers: req.headers,
        ...(req.body ? { body: req.body } : {}),
      });
      const resHeaders: Record<string, string> = {};
      response.headers.forEach((val: string, key: string) => {
        resHeaders[key] = val;
      });
      let body = '';
      try {
        body = await response.text();
      } catch {
        /* ignore */
      }
      return {
        status: response.status,
        statusText: response.statusText,
        headers: resHeaders,
        body,
        durationMs: Date.now() - startTs,
      };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }
);

/** Re-push ws:ready, ws:groups, and current playback state to the renderer.
 *  Called on did-finish-load (page refresh) and via the resync IPC handler. */
function resyncRendererState(): void {
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

ipcMain.handle('image:fetch', async (_event: IpcMainInvokeEvent, url: string) => {
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) {
    return { error: 'Invalid URL' };
  }
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': SPOOF_UA,
        ...(sessionToken ? { Cookie: `__Secure-next-auth.session-token=${sessionToken}` } : {}),
      },
    });
    if (!res.ok) return { error: `${res.status} ${res.statusText}` };
    const buf = Buffer.from(await res.arrayBuffer());
    const mimeType = res.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg';
    return { data: buf.toString('base64'), mimeType };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('playback:loadContent', (_event: IpcMainInvokeEvent, payload: Record<string, unknown>) => {
  const groupId = config.groupId;
  if (!ws || ws.readyState !== WebSocket.OPEN) return { error: 'WS not connected' };
  return wsSend({ namespace: 'playback', groupId, command: 'loadContent' }, payload);
});

ipcMain.handle('playback:refresh', (_event: IpcMainInvokeEvent) => {
  const groupId = config.groupId;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  // Re-subscribing triggers Sonos to push the current playbackExtended state immediately
  wsSend({ namespace: 'playbackExtended', groupId, command: 'subscribe' }, {}).catch(() => {});
});

ipcMain.handle('ws:resync', (_event: IpcMainInvokeEvent) => {
  resyncRendererState();
});

ipcMain.handle('playback:setPlayModes', (_event: IpcMainInvokeEvent, playModes: Record<string, unknown>) => {
  const groupId = config.groupId;
  if (!ws || ws.readyState !== WebSocket.OPEN) return { error: 'WS not connected' };
  return wsSend({ namespace: 'playback', groupId, command: 'setPlayModes' }, { playModes });
});

ipcMain.handle('playback:skipNext', (_event: IpcMainInvokeEvent) => {
  const groupId = config.groupId;
  if (!ws || ws.readyState !== WebSocket.OPEN) return { error: 'WS not connected' };
  return wsSend({ namespace: 'playback', groupId, command: 'skipToNextTrack' }, {});
});

ipcMain.handle('playback:skipPrev', (_event: IpcMainInvokeEvent) => {
  const groupId = config.groupId;
  if (!ws || ws.readyState !== WebSocket.OPEN) return { error: 'WS not connected' };
  return wsSend({ namespace: 'playback', groupId, command: 'skipBack' }, {});
});

ipcMain.handle('playback:skipToTrack', (_event: IpcMainInvokeEvent, trackNumber: number) => {
  const groupId = config.groupId;
  if (!ws || ws.readyState !== WebSocket.OPEN) return { error: 'WS not connected' };
  return wsSend({ namespace: 'playback', groupId, command: 'skipToTrack' }, { trackNumber });
});

// ─── Queue reorder algorithm ──────────────────────────────────────────────────
//
// The API only accepts contiguous runs per PATCH (?items=0,1&positions=4,5).
// A non-contiguous selection (e.g. [3,4,7]) is split into runs ([3,4] and [7])
// and each run is patched in sequence. After each patch the virtual queue
// changes, so subsequent runs' positions are recalculated against the updated
// state.
//
// Processing runs left-to-right works universally (moving earlier OR later):
// for each run we find its "pivot" — the item that should immediately precede
// the run in the desired final order — then look up that pivot's current
// position in the working array to derive finalPos.

interface ReorderBatch {
  items: number[];
  positions: number[];
}

function computeReorderBatches(fromIndices: number[], insertBefore: number, queueLength: number): ReorderBatch[] {
  const sorted = [...fromIndices].sort((a, b) => a - b);

  // Group into contiguous runs (left-to-right)
  const runs: number[][] = [];
  let curr = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) curr.push(sorted[i]);
    else {
      runs.push(curr);
      curr = [sorted[i]];
    }
  }
  runs.push(curr);

  // Build the desired target order
  const selectedSet = new Set(sorted);
  const nonSelected: number[] = [];
  for (let i = 0; i < queueLength; i++) if (!selectedSet.has(i)) nonSelected.push(i);

  // Anchor = first non-selected item at-or-after insertBefore
  let anchorIdx = nonSelected.length; // default: append at end
  for (let i = insertBefore; i < queueLength; i++) {
    if (!selectedSet.has(i)) {
      anchorIdx = nonSelected.indexOf(i);
      break;
    }
  }
  const target = [...nonSelected.slice(0, anchorIdx), ...sorted, ...nonSelected.slice(anchorIdx)];

  // Early-exit if already in the desired order
  if (target.every((v, i) => v === i)) return [];

  const working: number[] = Array.from({ length: queueLength }, (_, i) => i);
  const batches: ReorderBatch[] = [];

  for (const run of runs) {
    const runLen = run.length;
    const currentStart = working.indexOf(run[0]);

    // Find final position via the pivot item (what should immediately precede this run)
    const targetRunStart = target.indexOf(run[0]);
    let finalPos: number;
    if (targetRunStart === 0) {
      finalPos = 0;
    } else {
      const pivot = target[targetRunStart - 1];
      finalPos = working.indexOf(pivot) + 1;
    }

    if (currentStart === finalPos) continue; // run is already in place

    batches.push({
      items: Array.from({ length: runLen }, (_, i) => currentStart + i),
      positions: Array.from({ length: runLen }, (_, i) => finalPos + i),
    });

    // Apply the move to the working array so subsequent runs see the updated state
    const runContents = working.slice(currentStart, currentStart + runLen);
    const rest = [...working.slice(0, currentStart), ...working.slice(currentStart + runLen)];
    const insertAt = finalPos <= currentStart ? finalPos : finalPos - runLen;
    working.splice(0, working.length, ...rest.slice(0, insertAt), ...runContents, ...rest.slice(insertAt));
  }

  return batches;
}

ipcMain.handle(
  'queue:reorder',
  async (_event: IpcMainInvokeEvent, fromIndices: number[], toIndex: number, queueLength: number) => {
    if (!Array.isArray(fromIndices) || !fromIndices.every((i) => typeof i === 'number' && i >= 0))
      return { error: 'Invalid fromIndices' };
    if (typeof toIndex !== 'number' || toIndex < 0) return { error: 'Invalid toIndex' };
    if (typeof queueLength !== 'number' || queueLength <= 0) return { error: 'Invalid queueLength' };
    log(`[queue] reorder: [${fromIndices.join(',')}] → before ${toIndex} (n=${queueLength})`);
    if (!fromIndices.length) return { ok: true };

    const batches = computeReorderBatches(fromIndices, toIndex, queueLength);
    log(`[queue] reorder: ${batches.length} batch(es)`, JSON.stringify(batches));

    for (const batch of batches) {
      const result = await sonosFetch({
        operationId: 'reorderQueueResources',
        query: { items: batch.items.join(','), positions: batch.positions.join(',') },
      });
      if (result.error) {
        console.error('[queue] reorder batch failed:', result.error);
        return result;
      }
    }
    return { ok: true };
  }
);

ipcMain.handle('queue:remove', (_event: IpcMainInvokeEvent, indices: number[]) => {
  if (!Array.isArray(indices) || !indices.every((i) => typeof i === 'number' && i >= 0))
    return { error: 'Invalid indices' };
  log(`[queue] remove: [${indices.join(',')}]`);
  return sonosFetch({
    operationId: 'deleteQueueResources',
    query: { items: indices.join(',') },
  });
});

ipcMain.handle('queue:clear', (_event: IpcMainInvokeEvent) => {
  log('[queue] clear all');
  return sonosFetch({ operationId: 'deleteQueueResources' });
});

ipcMain.handle('queue:setId', (_event: IpcMainInvokeEvent, queueId: string) => {
  if (typeof queueId === 'string' && queueId) {
    config.queueId = queueId;
    log(`[queue] queueId synced: ${queueId}`);
  }
});

ipcMain.handle('group:set', (_event: IpcMainInvokeEvent, groupId: string) => {
  const group = discoveredGroups.find((g) => g.id === groupId);
  if (!group) return { error: `Unknown group: ${groupId}` };
  config.groupId = group.id;
  log(`[group] Switched to "${group.name}" — groupId: ${group.id}`);
  // Re-subscribe to playbackExtended for the new group — Sonos responds with an
  // extendedPlaybackStatus push so the renderer immediately gets fresh now-playing state.
  if (ws && ws.readyState === WebSocket.OPEN) {
    wsSend(
      {
        namespace: 'playbackExtended',
        groupId: group.id,
        command: 'subscribe',
      },
      {}
    ).catch(() => {});
  }
  return { ok: true };
});

// ─── Application menu ────────────────────────────────────────────────────────

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    // On macOS the first menu is always the app menu
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    { role: 'editMenu' as const },
    {
      label: 'Debug',
      submenu: [
        {
          label: 'WS Monitor',
          accelerator: 'CmdOrCtrl+Shift+W',
          click: () => openDebugWindow(),
        },
        {
          label: 'HTTP Monitor',
          accelerator: 'CmdOrCtrl+Shift+H',
          click: () => openHttpDebugWindow(),
        },
        { type: 'separator' },
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => uiWin?.webContents.reload(),
        },
        {
          label: 'DevTools',
          accelerator: 'CmdOrCtrl+Alt+I',
          click: () => uiWin?.webContents.toggleDevTools(),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

if (app.isPackaged) {
  autoUpdater.checkForUpdatesAndNotify();
  // autoUpdater.on('update-downloaded', () => {
  //   BrowserWindow.getAllWindows().forEach((w) => w.destroy());
  //   autoUpdater.quitAndInstall(true, false);
  // });
}

// ─── Process-level error handlers ────────────────────────────────────────────

process.on('uncaughtException', (err) => {
  console.error('[main] Uncaught exception:', err);
  telemetry.exception(err, { phase: 'uncaught_exception' });
  void telemetry.flush().finally(() => process.exit(1));
});

process.on('unhandledRejection', (reason) => {
  console.error('[main] Unhandled rejection:', reason);
  telemetry.exception(reason, { phase: 'unhandled_rejection' });
});

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  if (app.isPackaged) {
    Menu.setApplicationMenu(null);
  } else {
    buildMenu();
  }
  await loadConfig();

  telemetry.init(process.env.APPINSIGHTS_CONNECTION_STRING ?? '', app.getVersion());
  if (config.displayName) telemetry.setContext({ userId: config.displayName });

  session.defaultSession.setUserAgent(SPOOF_UA);

  // Try to restore a previously saved session — skip auth window if still valid
  const storedToken = await loadSessionToken();
  if (storedToken && (await validateSessionToken(storedToken))) {
    sessionToken = storedToken;
    log('[auth] Restored session from storage');
    authConfirmed = true;
    telemetry.event('app_started', { sessionRestored: true, appVersion: app.getVersion() });
    createUIWindow();
    connectWebSocket().catch(console.error);
    initPubSub().catch(console.error);
  } else {
    if (storedToken) await clearSessionToken(); // clear invalid token
    telemetry.event('app_started', { sessionRestored: false, appVersion: app.getVersion() });
    createAuthWindow();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createAuthWindow();
  });
});

app.on('before-quit', () => {
  quitting = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  ws?.terminate();
  officePubSub.disconnect();
  telemetry.event('app_quit');
  void telemetry.flush();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
