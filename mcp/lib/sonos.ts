// The parts of the desktop app's Sonos client the MCP needs, without Electron.
// Mirrors src/state.ts (constants), src/sonos-api.ts (sonosFetch headers) and src/sonos-ws.ts
// (ticket, socket, device topology): keep them in step when Sonos changes.

import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';

export const BASE_URL = 'https://play.sonos.com';
export const WS_URL = 'wss://api.ws.sonos.com/websocket';

// Same spoof as the desktop app: the Sonos BFF rejects non-browser agents.
export const SPOOF_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

// YouTube Music search IDs and the platform IDs queue/favourites/history use (generic, not per account).
export const SEARCH_SERVICE_ID = '72711';
export const SEARCH_ACCOUNT_ID = '13';
export const PLATFORM_SERVICE_ID = '16751367';
export const PLATFORM_ACCOUNT_ID = '123209393';

const SESSION_COOKIE = '__Secure-next-auth.session-token';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SonosResponse {
  status: number;
  ok: boolean;
  /** Parsed JSON, the raw text when it is not JSON, or null when empty. */
  body: unknown;
  contentType: string;
  /** Response headers worth reporting (bot-protection hints), never cookies. */
  server: string | null;
  /** A new session token when Sonos rotated the cookie on this response, else null. Persist it. */
  rotatedToken: string | null;
}

/** GET a play.sonos.com path with the session cookie (null: signed out), as the desktop app's sonosFetch sends it. */
export async function sonosGet(
  path: string,
  token: string | null,
  query: Record<string, string> = {}
): Promise<SonosResponse> {
  const qs = new URLSearchParams(query).toString();
  const res = await fetch(`${BASE_URL}${path}${qs ? `?${qs}` : ''}`, {
    headers: {
      ...(token ? { Cookie: `${SESSION_COOKIE}=${token}` } : {}),
      'X-Sonos-Timezone': '+01:00',
      'X-Sonos-Debug': 'use-section-text=true',
      Accept: '*/*',
      Referer: `${BASE_URL}/en-us/web-app`,
      'User-Agent': SPOOF_UA,
    },
  });
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return {
    status: res.status,
    ok: res.ok,
    body,
    contentType: res.headers.get('content-type') ?? '',
    server: res.headers.get('server') ?? (res.headers.has('cf-ray') ? 'cloudflare' : null),
    rotatedToken: rotatedSessionToken(res.headers.getSetCookie(), token),
  };
}

/** The session token from a Set-Cookie list when it differs from the one sent. */
export function rotatedSessionToken(setCookies: string[], current: string | null): string | null {
  for (const c of setCookies) {
    const match = new RegExp(`^${SESSION_COOKIE.replace(/[.]/g, '\\.')}=([^;]+)`).exec(c);
    if (match && match[1] !== current) return match[1];
  }
  return null;
}

/** Deep-search the /api/mfe payload for the WebSocket ticket UUID (same search as src/sonos-ws.ts). */
export function findTicket(obj: unknown, depth = 0): string | null {
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
    for (const [key, val] of Object.entries(rec)) {
      if (key.toLowerCase().includes('ticket') && typeof val === 'string' && UUID_RE.test(val)) return val;
    }
    for (const val of Object.values(rec)) {
      const hit = findTicket(val, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

export interface SonosSocket {
  /** Send a command and resolve with the response payload matched by corrId. */
  send(header: Record<string, unknown>, payload?: Record<string, unknown>): Promise<unknown>;
  /** Resolve with the first push whose `namespace:name` matches. */
  nextPush(key: string): Promise<unknown>;
  close(): void;
}

/** Open the Sonos control WebSocket with a ticket from /api/mfe. Short-lived: open, ask, close. */
export function openSonosSocket(ticket: string, timeoutMs = 10_000): Promise<SonosSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_URL}?ticket=${ticket}`, ['v1.api.smartspeaker.audio'], {
      headers: { Origin: BASE_URL, 'User-Agent': SPOOF_UA },
    });
    const pending = new Map<string, (payload: unknown) => void>();
    const pushWaiters = new Map<string, (payload: unknown) => void>();

    const withTimeout = <T>(what: string, register: (done: (v: T) => void) => void): Promise<T> =>
      new Promise<T>((res, rej) => {
        const timer = setTimeout(() => rej(new Error(`Sonos WS timeout: ${what}`)), timeoutMs);
        register((v) => {
          clearTimeout(timer);
          res(v);
        });
      });

    ws.on('message', (raw: WebSocket.RawData) => {
      let header: Record<string, unknown>;
      let payload: unknown;
      try {
        [header, payload] = JSON.parse(raw.toString()) as [Record<string, unknown>, unknown];
      } catch {
        return;
      }
      const corrId = header['corrId'];
      if (typeof corrId === 'string') {
        pending.get(corrId)?.(payload);
        pending.delete(corrId);
      }
      const key = `${String(header['namespace'])}:${String(header['name'] ?? header['type'])}`;
      pushWaiters.get(key)?.(payload);
      pushWaiters.delete(key);
    });

    const openTimer = setTimeout(() => {
      ws.terminate();
      reject(new Error('Sonos WS connect timeout'));
    }, timeoutMs);
    ws.once('error', (err: Error) => {
      clearTimeout(openTimer);
      reject(err);
    });
    ws.once('unexpected-response', (_req, res) => {
      clearTimeout(openTimer);
      reject(new Error(`Sonos WS handshake refused: ${res.statusCode}`));
    });
    ws.once('open', () => {
      clearTimeout(openTimer);
      resolve({
        send: (header, payload = {}) =>
          withTimeout(JSON.stringify(header), (done) => {
            const corrId = randomUUID();
            pending.set(corrId, done);
            ws.send(JSON.stringify([{ ...header, corrId }, payload]));
          }),
        nextPush: (key) => withTimeout(key, (done) => pushWaiters.set(key, done)),
        close: () => ws.close(1000),
      });
    });
  });
}

export interface SonosGroup {
  /** Session-scoped group id (RINCON_xxx:session). Changes between sessions: look it up each time. */
  id: string;
  /** Stable coordinator RINCON id; also the queue id. */
  coordinatorId: string;
  name: string;
}

/** Coordinator groups from a devices:devicesStatus push (same rules as extractDevices in src/sonos-ws.ts). */
export function groupsFromDevices(payload: unknown): SonosGroup[] {
  type Device = { info?: { id?: string; name?: string }; groupId?: string; isCoordinator?: boolean };
  const devices: Device[] = (payload as { devices?: Device[] } | null)?.devices ?? [];
  const groups: SonosGroup[] = [];
  for (const d of devices) {
    if (d.isCoordinator && d.groupId && d.info?.id) {
      groups.push({ id: d.groupId, coordinatorId: d.info.id, name: d.info.name ?? d.info.id });
    }
  }
  return groups;
}
