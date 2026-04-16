import {
  app,
  BrowserWindow,
  ipcMain,
  session,
  IpcMainInvokeEvent,
} from "electron";
import * as path from "path";
import { randomUUID } from "crypto";
import WebSocket from "ws";
import type { FetchRequest, FetchResponse } from "./types";

// ─── Config ──────────────────────────────────────────────────────────────────

interface Config {
  householdId: string;
  serviceId: string;
  accountId: string;
  // Separate credentials for the service-scoped search endpoint.
  searchServiceId: string;
  searchAccountId: string;
  // Discover groupId/queueId by intercepting a queue or playback request from
  // play.sonos.com, or by calling getGroups once authenticated.
  groupId: string;
  queueId: string;
}

const CONFIG: Config = {
  householdId: "Sonos_8P44MuPRwkQoJnASZVqEGvqbub.xvOabzVo9ZvrXqwCvzuH",
  serviceId: "16751367",
  accountId: "123209393",
  searchServiceId: "72711",   // YouTube Music — update if your primary service differs
  searchAccountId: "13",
  groupId: "RINCON_F0F6C1CDD9E201400",
  queueId: "736f08fb-54e0-45d0-aaf5-e5b31ab5b881",
};

const BASE_URL = "https://play.sonos.com";
const WS_URL = "wss://api.ws.sonos.com/websocket";

const SPOOF_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ─── Operation registry ───────────────────────────────────────────────────────

type HttpMethod = "GET" | "POST" | "DELETE" | "PATCH";

interface Operation {
  method: HttpMethod;
  path: string;
}

const OPERATIONS: Record<string, Operation> = {
  // Auth
  getAuthDiscovery: { method: "GET", path: "/api/authz/discovery" },
  // Groups
  getGroups: {
    method: "GET",
    path: "/api/groups/v1/households/:householdId/groups",
  },
  // Queue
  getQueueResources: {
    method: "GET",
    path: "/api/content/v1/groups/:groupId/services/:serviceId/accounts/:accountId/queues/:queueId/resources",
  },
  addQueueResource: {
    method: "POST",
    path: "/api/content/v1/groups/:groupId/services/:serviceId/accounts/:accountId/queues/:queueId/resources",
  },
  deleteQueueResources: {
    method: "DELETE",
    path: "/api/content/v1/groups/:groupId/services/:serviceId/accounts/:accountId/queues/:queueId/resources",
  },
  reorderQueueResources: {
    method: "PATCH",
    path: "/api/content/v1/groups/:groupId/services/:serviceId/accounts/:accountId/queues/:queueId/resources",
  },
  // Browse
  browseAlbum: {
    method: "GET",
    path: "/api/content/v2/households/:householdId/services/:serviceId/accounts/:accountId/albums/:albumId/browse",
  },
  browseArtist: {
    method: "GET",
    path: "/api/content/v2/households/:householdId/services/:serviceId/accounts/:accountId/artists/:artistId/browse",
  },
  browseContainer: {
    method: "GET",
    path: "/api/content/v2/households/:householdId/services/:serviceId/accounts/:accountId/containers/:containerId/browse",
  },
  browsePlaylist: {
    method: "GET",
    path: "/api/content/v2/households/:householdId/services/:serviceId/accounts/:accountId/playlists/:playlistId/browse",
  },
  getCatalogContainerResources: {
    method: "GET",
    path: "/api/content/v1/households/:householdId/services/:serviceId/accounts/:accountId/catalog/containers/:containerId/resources",
  },
  // Favorites & History
  getFavoriteResources: {
    method: "GET",
    path: "/api/content/v1/households/:householdId/services/:serviceId/accounts/:accountId/favorites/resources",
  },
  getHistory: {
    method: "GET",
    path: "/api/content/v1/households/:householdId/services/:serviceId/accounts/:accountId/history",
  },
  // Search
  searchHousehold: {
    method: "GET",
    path: "/api/content/v1/households/:householdId/search",
  },
  searchService: {
    method: "GET",
    path: "/api/content/v1/households/:householdId/services/:searchServiceId/accounts/:searchAccountId/search",
  },
  // Integrations
  getIntegrations: {
    method: "GET",
    path: "/api/content/v1/households/:householdId/integrations",
  },
  getIntegrationRegistrations: {
    method: "GET",
    path: "/api/content/v1/households/:householdId/integrations/registrations",
  },
  // Now Playing
  getTrackNowPlaying: {
    method: "GET",
    path: "/api/content/v2/households/:householdId/services/:serviceId/accounts/:accountId/tracks/:trackId/nowplaying",
  },
  // Playback (BFF paths — verify by intercepting traffic)
  getPlaybackState: { method: "GET", path: "/api/playback/v1/groups/:groupId" },
  play: { method: "POST", path: "/api/playback/v1/groups/:groupId/play" },
  pause: { method: "POST", path: "/api/playback/v1/groups/:groupId/pause" },
  skipToNextTrack: {
    method: "POST",
    path: "/api/playback/v1/groups/:groupId/skipToNextTrack",
  },
  skipToPreviousTrack: {
    method: "POST",
    path: "/api/playback/v1/groups/:groupId/skipToPreviousTrack",
  },
  setPlayMode: {
    method: "POST",
    path: "/api/playback/v1/groups/:groupId/playMode",
  },
  seek: {
    method: "POST",
    path: "/api/playback/v1/groups/:groupId/seek",
  },
  // Platform
  getMfe: { method: "GET", path: "/api/mfe" },
  getOptimizelyConfig: { method: "GET", path: "/api/optimizely/:key" },
  postMetrics: { method: "POST", path: "/api/metrics" },
};

// ─── URL builder ──────────────────────────────────────────────────────────────

function buildUrl(
  operationPath: string,
  pathParams: Record<string, string> = {},
  query: Record<string, string | undefined> = {},
): string {
  const configDefaults: Record<string, string> = {};
  if (CONFIG.householdId) configDefaults["householdId"] = CONFIG.householdId;
  if (CONFIG.serviceId) configDefaults["serviceId"] = CONFIG.serviceId;
  if (CONFIG.accountId) configDefaults["accountId"] = CONFIG.accountId;
  if (CONFIG.searchServiceId) configDefaults["searchServiceId"] = CONFIG.searchServiceId;
  if (CONFIG.searchAccountId) configDefaults["searchAccountId"] = CONFIG.searchAccountId;
  if (CONFIG.groupId) configDefaults["groupId"] = CONFIG.groupId;
  if (CONFIG.queueId) configDefaults["queueId"] = CONFIG.queueId;

  const params: Record<string, string> = { ...configDefaults, ...pathParams };

  const urlPath = operationPath.replace(/:([a-zA-Z]+)/g, (_, key: string) => {
    if (!(key in params)) throw new Error(`Missing path param: ${key}`);
    return encodeURIComponent(params[key]);
  });

  const qs = Object.entries(query)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  return `${BASE_URL}${urlPath}${qs ? `?${qs}` : ""}`;
}

// ─── HTTP fetch helper ────────────────────────────────────────────────────────

async function sonosFetch(request: FetchRequest): Promise<FetchResponse> {
  if (!sessionToken) {
    return { error: "No session token — please log in first" };
  }

  const operation = OPERATIONS[request.operationId];
  if (!operation) {
    return { error: `Unknown operation: ${request.operationId}` };
  }

  let url: string;
  try {
    url = buildUrl(operation.path, request.pathParams, request.query);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }

  // Build headers once so we can log them before sending
  const reqHeaders: Record<string, string> = {
    Cookie: `__Secure-next-auth.session-token=${sessionToken}`,
    "X-Sonos-Timezone": "+01:00",
    "X-Sonos-Debug": "use-section-text=true",
    Accept: "*/*",
    Referer: `${BASE_URL}/en-us/web-app`,
    "User-Agent": SPOOF_UA,
    ...(request.body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...request.headers,
  };

  const reqId = randomUUID();
  const startTs = Date.now();

  httpDebugWin?.webContents.send("http:req", {
    id: reqId,
    ts: startTs,
    operationId: request.operationId,
    method: operation.method,
    url,
    headers: reqHeaders,
    body: request.body !== undefined ? JSON.stringify(request.body) : undefined,
  });

  console.log(`[api] ${operation.method} ${url}`);

  let response: Response;
  try {
    response = await fetch(url, {
      method: operation.method,
      headers: reqHeaders,
      ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
    });
  } catch (err) {
    const errorMsg = `Fetch failed: ${err instanceof Error ? err.message : String(err)}`;
    httpDebugWin?.webContents.send("http:res", {
      id: reqId, status: 0, statusText: "Network Error",
      headers: {}, body: errorMsg, durationMs: Date.now() - startTs,
    });
    return { error: errorMsg };
  }

  // Read as text once — used for both debug window and response parsing
  const resHeaders: Record<string, string> = {};
  response.headers.forEach((val: string, key: string) => { resHeaders[key] = val; });
  let bodyText = "";
  try { bodyText = await response.text(); } catch { /* ignore */ }

  httpDebugWin?.webContents.send("http:res", {
    id: reqId,
    status: response.status,
    statusText: response.statusText,
    headers: resHeaders,
    body: bodyText,
    durationMs: Date.now() - startTs,
  });

  if (response.status === 401) {
    console.log("[api] 401 — auth expired, re-showing auth window");
    authConfirmed = false;
    uiWin?.webContents.send("auth:expired");
    if (authWin) {
      authWin.show();
    } else {
      createAuthWindow();
    }
    return { error: "401 Unauthorized — re-authenticating" };
  }

  if (!response.ok) {
    console.error(
      `[api] ${response.status} ${response.statusText} — ${url}\n${bodyText.slice(0, 500)}`,
    );
    return {
      error: `${response.status} ${response.statusText}${bodyText ? `: ${bodyText.slice(0, 200)}` : ""}`,
    };
  }

  if (!bodyText) return { data: null };

  try {
    return { data: JSON.parse(bodyText) };
  } catch {
    return { error: `Response is not JSON (${response.status} ${response.statusText})` };
  }
}

// ─── WebSocket ────────────────────────────────────────────────────────────────

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let ws: WebSocket | null = null;
let reconnectDelay = 1000;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

// Keyed by corrId — resolves when a matching response arrives
const wsPending = new Map<string, (payload: unknown) => void>();
// Keyed by 'namespace:name' — one-shot, fired on the first matching push
const wsPushOnce = new Map<string, (payload: unknown) => void>();

function wsSend(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error("WebSocket not open"));
      return;
    }
    const corrId = randomUUID();
    const timer = setTimeout(() => {
      wsPending.delete(corrId);
      reject(new Error(`WS timeout: ${JSON.stringify(header)}`));
    }, 10_000);
    wsPending.set(corrId, (p) => {
      clearTimeout(timer);
      resolve(p);
    });
    const frame = [{ ...header, corrId }, payload];
    debugWin?.webContents.send("ws:out", frame);
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
  const corrId = header["corrId"] as string | undefined;
  if (corrId && wsPending.has(corrId)) {
    wsPending.get(corrId)!(payload);
    wsPending.delete(corrId);
  }

  // Fire one-shot push listener
  const ns = header["namespace"] as string | undefined;
  const name = (header["name"] ?? header["type"]) as string | undefined;
  if (ns && name) {
    const key = `${ns}:${name}`;
    if (wsPushOnce.has(key)) {
      wsPushOnce.get(key)!(payload);
      wsPushOnce.delete(key);
    }
  }

  // Forward everything to the UI window and debug monitor
  uiWin?.webContents.send("ws:message", [header, payload]);
  debugWin?.webContents.send("ws:in", [header, payload]);
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
  const devices: WsDevice[] =
    (payload as { devices?: WsDevice[] })?.devices ?? [];

  // Build a map of groupId → {coordinator, all members}
  const groupMap = new Map<
    string,
    { coordinator?: WsDevice; members: WsDevice[] }
  >();
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
      playerIds: members.map((m) => m.info?.id ?? "").filter(Boolean),
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
  if (typeof obj === "object") {
    const rec = obj as Record<string, unknown>;
    // Prefer keys that look like 'ticket'
    for (const [key, val] of Object.entries(rec)) {
      if (
        key.toLowerCase().includes("ticket") &&
        typeof val === "string" &&
        UUID_RE.test(val)
      ) {
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
  if (!sessionToken) throw new Error("No session token");
  const res = await fetch(`${BASE_URL}/api/mfe`, {
    headers: {
      Cookie: `__Secure-next-auth.session-token=${sessionToken}`,
      "User-Agent": SPOOF_UA,
      Accept: "*/*",
      Referer: `${BASE_URL}/en-us/web-app`,
    },
  });
  if (!res.ok) throw new Error(`MFE fetch ${res.status}`);
  return res.json();
}

// ─── WebSocket bootstrap sequence ────────────────────────────────────────────

async function runBootstrap(): Promise<void> {
  console.log("[ws] Bootstrap start");

  // 1 ─ Get households (confirms connection, gives live householdId)
  const householdsResp = await wsSend(
    { command: "getHouseholds", namespace: "households" },
    { connectedOnly: "true" },
  );
  const households =
    (householdsResp as { households?: Array<{ id: string }> })?.households ??
    [];
  const householdId = households[0]?.id ?? CONFIG.householdId;
  console.log("[ws] Household:", householdId);

  // 2 ─ Subscribe to devices; the immediate push carries the full topology
  const devicesPayload = await new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("devices push timeout")),
      10_000,
    );
    wsPushOnce.set("devices:devicesStatus", (p) => {
      clearTimeout(timer);
      resolve(p);
    });
    wsSend(
      { namespace: "devices", householdId, command: "subscribe" },
      {},
    ).catch(reject);
  });

  const { coordinatorGroupIds, playerIds, groups } =
    extractDevices(devicesPayload);
  console.log(
    `[ws] ${coordinatorGroupIds.length} coordinator group(s), ${playerIds.length} player(s)`,
  );
  groups.forEach((g) => console.log(`[ws]   group "${g.name}" — ${g.id}`));

  // Update live group list and prime CONFIG with the first group
  discoveredGroups = groups;
  if (groups.length > 0) {
    CONFIG.groupId = groups[0].id;
    console.log(`[ws] Active group: "${groups[0].name}" (${groups[0].id})`);
  }

  // 3 ─ Subscribe to playbackExtended first so we can capture initial state
  const pbSubResults = await Promise.all(
    coordinatorGroupIds.map((groupId) =>
      wsSend(
        { namespace: "playbackExtended", groupId, command: "subscribe" },
        {},
      )
        .then((resp) => ({ groupId, resp }))
        .catch(() => null),
    ),
  );

  // 4 ─ Subscribe to volume / hardware (fire-and-forget)
  await Promise.all([
    ...coordinatorGroupIds.map((groupId) =>
      wsSend({ namespace: "groupVolume", groupId, command: "subscribe" }, {}),
    ),
    ...playerIds.flatMap((playerId) => [
      wsSend({ namespace: "playerVolume", playerId, command: "subscribe" }, {}),
      wsSend(
        { namespace: "hardwareStatus", playerId, command: "subscribe" },
        {},
      ),
    ]),
  ]);

  // Notify renderer: WS is ready + send group list
  uiWin?.webContents.send("ws:ready");
  uiWin?.webContents.send("ws:groups", groups);

  // Forward initial playback state for the active group only.
  // Sending all groups causes the last payload to overwrite the first because
  // the renderer's activeGroupIdRef is still null when these arrive.
  const activeResult = pbSubResults.find((r) => r?.groupId === CONFIG.groupId);
  if (activeResult?.resp) {
    uiWin?.webContents.send("ws:message", [
      { namespace: "playbackExtended", groupId: activeResult.groupId },
      activeResult.resp,
    ]);
  }

  console.log("[ws] Bootstrap complete");
}

// ─── WebSocket lifecycle ──────────────────────────────────────────────────────

function scheduleReconnect(): void {
  if (reconnectTimer) return; // already pending
  console.log(`[ws] Reconnecting in ${reconnectDelay / 1000}s`);
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
    console.error(
      "[ws] Ticket fetch failed:",
      err instanceof Error ? err.message : err,
    );
    scheduleReconnect();
    return;
  }

  if (!ticket) {
    console.error("[ws] No ticket found in MFE response");
    scheduleReconnect();
    return;
  }

  console.log("[ws] Connecting, ticket:", ticket.slice(0, 8) + "…");

  ws = new WebSocket(
    `${WS_URL}?ticket=${ticket}`,
    ["v1.api.smartspeaker.audio"],
    {
      headers: { Origin: BASE_URL, "User-Agent": SPOOF_UA },
    },
  );

  ws.on("open", () => {
    console.log("[ws] Connected");
    reconnectDelay = 1000; // reset backoff on successful connect
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    runBootstrap().catch((err) => {
      console.error(
        "[ws] Bootstrap error:",
        err instanceof Error ? err.message : err,
      );
      ws?.close();
    });
  });

  ws.on("message", handleWsMessage);

  ws.on("error", (err) => console.error("[ws] Error:", err.message));

  ws.on("close", (code) => {
    console.log(`[ws] Closed (${code})`);
    ws = null;
    scheduleReconnect();
  });
}

// ─── App windows ──────────────────────────────────────────────────────────────

let sessionToken: string | null = null;
let authWin: BrowserWindow | null = null;
let uiWin: BrowserWindow | null = null;
let debugWin: BrowserWindow | null = null;
let httpDebugWin: BrowserWindow | null = null;
let authConfirmed = false; // prevents onAuthReady firing on every /api/content/ 200

function openDebugWindow(): void {
  if (debugWin && !debugWin.isDestroyed()) {
    debugWin.focus();
    return;
  }
  debugWin = new BrowserWindow({
    width: 960,
    height: 700,
    title: "WS Monitor",
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  debugWin.loadFile(path.join(__dirname, "debug-ws.html"));
  debugWin.on("closed", () => { debugWin = null; });
}

function openHttpDebugWindow(): void {
  if (httpDebugWin && !httpDebugWin.isDestroyed()) {
    httpDebugWin.focus();
    return;
  }
  httpDebugWin = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "HTTP Monitor",
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  httpDebugWin.loadFile(path.join(__dirname, "debug-http.html"));
  httpDebugWin.on("closed", () => { httpDebugWin = null; });
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
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: [`${BASE_URL}/*`] },
    (details, callback) => {
      const headers = { ...details.requestHeaders };
      headers["User-Agent"] = SPOOF_UA;

      const cookieHeader = headers["Cookie"] ?? headers["cookie"] ?? "";
      const match = cookieHeader.match(
        /__Secure-next-auth\.session-token=([^;]+)/,
      );
      if (match) {
        const token = match[1];
        if (token !== sessionToken) {
          sessionToken = token;
          console.log(
            "[auth] Session token captured:",
            token.slice(0, 20) + "…",
          );
        }
      }

      callback({ requestHeaders: headers });
    },
  );

  // A successful /api/content/ response confirms the session is live
  session.defaultSession.webRequest.onCompleted(
    { urls: [`${BASE_URL}/api/content/*`] },
    (details) => {
      if (details.statusCode === 200 && authWin) {
        console.log("[auth] /api/content/ 200 — auth confirmed");
        onAuthReady();
      }
    },
  );

  // Local Sonos devices serve album art over plain HTTP with no CORS headers.
  // Inject the header so the renderer's fetch() can load them.
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ["http://*/*"] },
    (details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "access-control-allow-origin": ["*"],
        },
      });
    },
  );
}

function onAuthReady(): void {
  if (authConfirmed) return; // fire only once per login
  authConfirmed = true;

  authWin?.hide();

  if (!uiWin) {
    createUIWindow();
  } else {
    uiWin.show();
    uiWin.webContents.send("auth:ready");
  }

  connectWebSocket().catch(console.error);
}

function createUIWindow(): void {
  uiWin = new BrowserWindow({
    width: 960,
    height: 640,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  if (app.isPackaged) {
    uiWin.loadFile(
      path.join(__dirname, "..", "renderer", "dist", "index.html"),
    );
  } else {
    uiWin.loadURL("http://localhost:5173");
  }

  uiWin.webContents.on("did-finish-load", () => {
    if (authConfirmed) uiWin?.webContents.send("auth:ready");
  });
}

// ─── IPC ──────────────────────────────────────────────────────────────────────

ipcMain.handle(
  "api:fetch",
  async (
    _event: IpcMainInvokeEvent,
    request: FetchRequest,
  ): Promise<FetchResponse> => {
    return sonosFetch(request);
  },
);

ipcMain.handle(
  "volume:group:set",
  (_event: IpcMainInvokeEvent, volume: number) => {
    const groupId = CONFIG.groupId;
    if (!ws || ws.readyState !== WebSocket.OPEN)
      return { error: "WS not connected" };
    return wsSend(
      { namespace: "groupVolume", groupId, command: "setVolume" },
      { volume },
    );
  },
);

ipcMain.handle("playback:play", (_event: IpcMainInvokeEvent) => {
  const groupId = CONFIG.groupId;
  if (!ws || ws.readyState !== WebSocket.OPEN)
    return { error: "WS not connected" };
  return wsSend(
    { namespace: "playback", groupId, command: "play" },
    { allowTvPauseRestore: true, deviceFeedback: "NONE" },
  );
});

ipcMain.handle("playback:pause", (_event: IpcMainInvokeEvent) => {
  const groupId = CONFIG.groupId;
  if (!ws || ws.readyState !== WebSocket.OPEN)
    return { error: "WS not connected" };
  return wsSend(
    { namespace: "playback", groupId, command: "pause" },
    { allowTvPauseRestore: true, deviceFeedback: "NONE" },
  );
});

ipcMain.handle("debug:openWsMonitor",   () => openDebugWindow());
ipcMain.handle("debug:openHttpMonitor", () => openHttpDebugWindow());

ipcMain.handle("http:resend", async (
  _event: IpcMainInvokeEvent,
  req: { method: string; url: string; headers: Record<string, string>; body?: string },
) => {
  const startTs = Date.now();
  try {
    const response = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      ...(req.body ? { body: req.body } : {}),
    });
    const resHeaders: Record<string, string> = {};
    response.headers.forEach((val: string, key: string) => { resHeaders[key] = val; });
    let body = "";
    try { body = await response.text(); } catch { /* ignore */ }
    return { status: response.status, statusText: response.statusText, headers: resHeaders, body, durationMs: Date.now() - startTs };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle("playback:refresh", (_event: IpcMainInvokeEvent) => {
  const groupId = CONFIG.groupId;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  // Re-subscribing triggers Sonos to push the current playbackExtended state immediately
  wsSend(
    { namespace: "playbackExtended", groupId, command: "subscribe" },
    {},
  ).catch(() => {});
});

ipcMain.handle(
  "playback:setPlayModes",
  (_event: IpcMainInvokeEvent, playModes: Record<string, unknown>) => {
    const groupId = CONFIG.groupId;
    if (!ws || ws.readyState !== WebSocket.OPEN)
      return { error: "WS not connected" };
    return wsSend(
      { namespace: "playback", groupId, command: "setPlayModes" },
      { playModes },
    );
  },
);

ipcMain.handle("playback:skipNext", (_event: IpcMainInvokeEvent) => {
  const groupId = CONFIG.groupId;
  if (!ws || ws.readyState !== WebSocket.OPEN)
    return { error: "WS not connected" };
  return wsSend(
    { namespace: "playback", groupId, command: "skipToNextTrack" },
    {},
  );
});

ipcMain.handle("playback:skipPrev", (_event: IpcMainInvokeEvent) => {
  const groupId = CONFIG.groupId;
  if (!ws || ws.readyState !== WebSocket.OPEN)
    return { error: "WS not connected" };
  return wsSend({ namespace: "playback", groupId, command: "skipBack" }, {});
});

ipcMain.handle(
  "playback:skipToTrack",
  (_event: IpcMainInvokeEvent, trackNumber: number) => {
    const groupId = CONFIG.groupId;
    if (!ws || ws.readyState !== WebSocket.OPEN)
      return { error: "WS not connected" };
    return wsSend(
      { namespace: "playback", groupId, command: "skipToTrack" },
      { trackNumber },
    );
  },
);

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

interface ReorderBatch { items: number[]; positions: number[] }

function computeReorderBatches(
  fromIndices: number[],
  insertBefore: number,
  queueLength: number,
): ReorderBatch[] {
  const sorted = [...fromIndices].sort((a, b) => a - b);

  // Group into contiguous runs (left-to-right)
  const runs: number[][] = [];
  let curr = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) curr.push(sorted[i]);
    else { runs.push(curr); curr = [sorted[i]]; }
  }
  runs.push(curr);

  // Build the desired target order
  const selectedSet = new Set(sorted);
  const nonSelected: number[] = [];
  for (let i = 0; i < queueLength; i++) if (!selectedSet.has(i)) nonSelected.push(i);

  // Anchor = first non-selected item at-or-after insertBefore
  let anchorIdx = nonSelected.length; // default: append at end
  for (let i = insertBefore; i < queueLength; i++) {
    if (!selectedSet.has(i)) { anchorIdx = nonSelected.indexOf(i); break; }
  }
  const target = [
    ...nonSelected.slice(0, anchorIdx),
    ...sorted,
    ...nonSelected.slice(anchorIdx),
  ];

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
      items:     Array.from({ length: runLen }, (_, i) => currentStart + i),
      positions: Array.from({ length: runLen }, (_, i) => finalPos    + i),
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
  "queue:reorder",
  async (_event: IpcMainInvokeEvent, fromIndices: number[], toIndex: number, queueLength: number) => {
    console.log(`[queue] reorder: [${fromIndices.join(',')}] → before ${toIndex} (n=${queueLength})`);
    if (!fromIndices.length) return { ok: true };

    const batches = computeReorderBatches(fromIndices, toIndex, queueLength);
    console.log(`[queue] reorder: ${batches.length} batch(es)`, JSON.stringify(batches));

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
  },
);

ipcMain.handle("queue:remove", (_event: IpcMainInvokeEvent, indices: number[]) => {
  console.log(`[queue] remove: [${indices.join(',')}]`);
  return sonosFetch({
    operationId: 'deleteQueueResources',
    query: { items: indices.join(',') },
  });
});

ipcMain.handle("queue:clear", (_event: IpcMainInvokeEvent) => {
  console.log('[queue] clear all');
  return sonosFetch({ operationId: 'deleteQueueResources' });
});

ipcMain.handle("group:set", (_event: IpcMainInvokeEvent, groupId: string) => {
  const group = discoveredGroups.find((g) => g.id === groupId);
  if (!group) return { error: `Unknown group: ${groupId}` };
  CONFIG.groupId = group.id;
  console.log(`[group] Switched to "${group.name}" — groupId: ${group.id}`);
  // Re-subscribe to playbackExtended for the new group — Sonos responds with an
  // extendedPlaybackStatus push so the renderer immediately gets fresh now-playing state.
  if (ws && ws.readyState === WebSocket.OPEN) {
    wsSend(
      {
        namespace: "playbackExtended",
        groupId: group.id,
        command: "subscribe",
      },
      {},
    ).catch(() => {});
  }
  return { ok: true };
});

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  session.defaultSession.setUserAgent(SPOOF_UA);
  createAuthWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createAuthWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
