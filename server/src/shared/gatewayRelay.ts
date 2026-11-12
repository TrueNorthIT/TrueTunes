// The WebSocket half of the Sonos gateway: `GET /sonos/ws` relays a client's socket to Sonos's own
// WebSocket (wss://api.ws.sonos.com/websocket), so the client never holds a Sonos session or ticket.
// The HTTP half is in gatewayHttp.ts.
//
// For each accepted client the relay gets a fresh single-use ticket (GET https://play.sonos.com/api/mfe
// with the shared session cookie), opens the upstream socket with it, and passes frames both ways
// untouched and in order. Whichever side closes, the other is closed too.
//
// Everything is injected (session, fetch, the socket constructor), so nothing here imports Azure, `ws`
// or the network. The ticket and the session are never sent to the client or logged, and neither are
// the causes of failures (a socket error can quote the URL, ticket included).
import {
  SESSION_COOKIE,
  SONOS_ORIGIN,
  SONOS_REFERER,
  SONOS_TIMEOUT_MS,
  SPOOF_UA,
  type GatewaySession,
  type Verify,
} from './gatewayHttp';

export const SONOS_WS_URL = 'wss://api.ws.sonos.com/websocket';
export const SONOS_WS_PROTOCOL = 'v1.api.smartspeaker.audio';

/** A text frame is a string and a binary frame is a Uint8Array, in both directions. */
export type SocketData = string | Uint8Array;

/** The end of the relay facing the desktop app (a `ws` WebSocket adapts to this directly). */
export interface ClientSocket {
  send(data: SocketData): void;
  close(code?: number, reason?: string): void;
  on(event: 'message', listener: (data: SocketData) => void): void;
  on(event: 'close', listener: (code: number, reason: string) => void): void;
  on(event: 'error', listener: (err: Error) => void): void;
}

/** The end facing Sonos: the same, plus 'open' when the handshake completes. */
export interface UpstreamSocket {
  send(data: SocketData): void;
  close(code?: number, reason?: string): void;
  on(event: 'open', listener: () => void): void;
  on(event: 'message', listener: (data: SocketData) => void): void;
  on(event: 'close', listener: (code: number, reason: string) => void): void;
  on(event: 'error', listener: (err: Error) => void): void;
}

export interface RelayDeps {
  session: GatewaySession;
  fetch: typeof fetch;
  /** Opens wss://api.ws.sonos.com/... Takes only a URL and subprotocols, so no Origin header is sent. */
  connectUpstream: (url: string, protocols: string[]) => UpstreamSocket;
  log?: (msg: string) => void;
}

/** A browser cannot set headers on a WebSocket, so it offers its Entra ID token as this subprotocol value. */
export const BEARER_PROTOCOL_PREFIX = 'bearer.';

/** The token a browser offered as a `bearer.<token>` subprotocol, if any. */
function tokenFromProtocols(offered: string | string[] | undefined): string | undefined {
  const all = (Array.isArray(offered) ? offered.join(',') : (offered ?? '')).split(',');
  const token = all
    .map((p) => p.trim())
    .find((p) => p.startsWith(BEARER_PROTOCOL_PREFIX))
    ?.slice(BEARER_PROTOCOL_PREFIX.length);
  return token || undefined;
}

/**
 * Who is opening the socket: the Entra token on the upgrade request, checked by `verify`. A null means
 * the upgrade is to be refused with 401 before any relay or Sonos socket exists. Fails closed.
 *
 * The desktop app sends `Authorization: Bearer <token>`. A browser sends the same token as a
 * `bearer.<token>` entry in Sec-WebSocket-Protocol, beside the Sonos subprotocol: a request header like
 * Authorization, so the token is in no URL. The server never selects that entry (see selectSubprotocol).
 */
export async function authoriseUpgrade(
  headers: Record<string, string | string[] | undefined>,
  verify: Verify
): Promise<{ oid: string } | null> {
  try {
    return await verify(credentialFromHeaders(headers));
  } catch {
    return null;
  }
}

/** The Authorization value an upgrade carries: the header, else a browser's `bearer.<token>` subprotocol as "Bearer <token>". */
export function credentialFromHeaders(headers: Record<string, string | string[] | undefined>): string | undefined {
  const authorization = headers['authorization'];
  if (typeof authorization === 'string') return authorization;
  const token = tokenFromProtocols(headers['sec-websocket-protocol']);
  return token ? `Bearer ${token}` : undefined;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The ticket: a UUID under a key containing "ticket", found anywhere in the mfe response. */
function findTicket(value: unknown, depth = 0): string | null {
  if (depth > 10 || value === null || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = findTicket(item, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  const record = value as Record<string, unknown>;
  for (const [key, val] of Object.entries(record)) {
    if (key.toLowerCase().includes('ticket') && typeof val === 'string' && UUID.test(val)) return val;
  }
  for (const val of Object.values(record)) {
    const hit = findTicket(val, depth + 1);
    if (hit) return hit;
  }
  return null;
}

/** The subprotocol the gateway answers an upgrade with: Sonos's, or none (the upgrade fails). Never a bearer entry. */
export function selectSubprotocol(offered: Set<string>): string | false {
  return offered.has(SONOS_WS_PROTOCOL) ? SONOS_WS_PROTOCOL : false;
}

export const PUBSUB_WS_PROTOCOL = 'json.webpubsub.azure.v1';

/**
 * The subprotocol for the path being upgraded: Sonos's on /sonos/ws, Web PubSub's on /pubsub/ws, and none (the
 * upgrade fails) if that path's own protocol was not offered or the path is neither. Never a bearer entry.
 */
export function selectSubprotocolForPath(path: string, offered: Set<string>): string | false {
  const wanted = path === '/sonos/ws' ? SONOS_WS_PROTOCOL : path === '/pubsub/ws' ? PUBSUB_WS_PROTOCOL : undefined;
  return wanted && offered.has(wanted) ? wanted : false;
}

/** `handleProtocols` for the gateway's WebSocketServer: the choice depends on the path of the upgrade request. */
export function handleProtocols(offered: Set<string>, request: { url?: string }): string | false {
  return selectSubprotocolForPath((request.url ?? '/').split('?')[0] ?? '/', offered);
}

/** Close codes that may be put in a close frame (RFC 6455 section 7.4.1); 1005, 1006 and 1015 may not. */
const isSendable = (code: number): boolean =>
  (code >= 1000 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006) || (code >= 3000 && code <= 4999);

const passOn = (code: number): number | undefined => (isSendable(code) ? code : undefined);

/** Frames held while the upstream is still connecting. */
const MAX_BUFFERED_FRAMES = 1000;

/** What differs between relays: what is logged when the upstream cannot be reached. */
interface PipeOptions {
  log: (msg: string) => void;
  /** Logged when the upstream cannot be obtained or opened. A fixed line: never the cause, which can quote a secret. */
  connectFailed: string;
  /** Logged when the upstream socket reports an error. */
  upstreamError: string;
}

/**
 * The part every relay shares: pipes `client` to the upstream that `openUpstream` yields, frames both ways,
 * untouched and in order. `openUpstream` may take a while (a ticket, a connect call); `gone()` tells it the client
 * has already left, so it can return undefined instead of opening anything. Whichever side closes, the other is
 * closed too; anything that goes wrong closes the client with 1011.
 */
async function pipe(
  client: ClientSocket,
  openUpstream: (gone: () => boolean) => Promise<UpstreamSocket | undefined>,
  o: PipeOptions
): Promise<void> {
  let upstream: UpstreamSocket | undefined;
  let upstreamOpen = false;
  let finished = false;
  const early: SocketData[] = []; // client frames sent before the upstream opened

  const safely = (action: () => void) => {
    try {
      action();
    } catch {
      /* the socket is already gone */
    }
  };

  /** Ends the relay: the sockets named are closed, once, and nothing more is forwarded. */
  const end = (closeClient?: { code?: number }, closeUpstream?: { code?: number }) => {
    if (finished) return;
    finished = true;
    early.length = 0;
    if (closeClient) safely(() => client.close(closeClient.code));
    if (closeUpstream && upstream) safely(() => upstream?.close(closeUpstream.code));
  };

  const failed = () => end({ code: 1011 }, {});

  // Listen before anything is awaited: the app sends its first command as soon as its socket is open.
  client.on('message', (data) => {
    if (finished) return;
    if (upstream && upstreamOpen) {
      try {
        upstream.send(data);
      } catch {
        failed();
      }
    } else if (early.length < MAX_BUFFERED_FRAMES) {
      early.push(data);
    } else {
      // shortcut: a client that floods the relay before the upstream answers is cut off, not slowed down.
      end({ code: 1008 }, {});
    }
  });
  client.on('close', (code) => end(undefined, { code: passOn(code) }));
  client.on('error', () => end(undefined, { code: 1011 }));

  try {
    upstream = await openUpstream(() => finished);
    if (!upstream) return; // the client left while the upstream was being arranged
  } catch {
    o.log(o.connectFailed);
    failed();
    return;
  }

  const remote = upstream;
  remote.on('open', () => {
    if (finished) return;
    upstreamOpen = true;
    for (const data of early.splice(0)) {
      try {
        remote.send(data);
      } catch {
        failed();
        return;
      }
    }
  });
  remote.on('message', (data) => {
    if (finished) return;
    try {
      client.send(data);
    } catch {
      failed();
    }
  });
  remote.on('error', () => {
    if (!finished) o.log(o.upstreamError);
    failed();
  });
  remote.on('close', (code) => {
    // Closed before it ever opened: the connection failed. Afterwards: pass the close on.
    if (upstreamOpen) end({ code: passOn(code) }, undefined);
    else failed();
  });
}

export function createRelay(deps: RelayDeps): { accept(client: ClientSocket): Promise<void> } {
  const log = deps.log ?? (() => {});

  /** A fresh ticket, with one refresh and retry if Sonos rejects the session. Throws if there is none. */
  async function fetchTicket(): Promise<string> {
    const ask = (session: string) =>
      deps.fetch(`${SONOS_ORIGIN}/api/mfe`, {
        headers: {
          Cookie: `${SESSION_COOKIE}=${session}`,
          'User-Agent': SPOOF_UA,
          Accept: '*/*',
          Referer: SONOS_REFERER,
        },
        signal: AbortSignal.timeout(SONOS_TIMEOUT_MS),
      });
    let res = await ask(await deps.session.get());
    if (res.status === 401) res = await ask(await deps.session.get({ refresh: true }));
    if (!res.ok) throw new Error(`mfe answered ${res.status}`);
    const ticket = findTicket(await res.json());
    if (!ticket) throw new Error('mfe had no ticket');
    return ticket;
  }

  return {
    accept: (client) =>
      pipe(
        client,
        async (gone) => {
          const ticket = await fetchTicket();
          if (gone()) return undefined; // the client left while the ticket was being fetched
          return deps.connectUpstream(`${SONOS_WS_URL}?ticket=${ticket}`, [SONOS_WS_PROTOCOL]);
        },
        {
          log,
          connectFailed: '[relay] could not get a Sonos ticket or open the Sonos socket',
          upstreamError: '[relay] the Sonos socket reported an error',
        }
      ),
  };
}

// ── /pubsub/ws: the caller's own Azure Web PubSub connection ──
//
// The desktop app gets a client access URL from POST /api/connect and opens it itself. A browser may only talk to
// its own origin, so the gateway makes that call with the caller's token, opens the URL, and pipes frames. The URL
// carries an access token: like the Sonos ticket it is never logged or sent to the client.

export interface PubSubRelayDeps {
  fetch: typeof fetch;
  /** The Function App's origin, e.g. https://truetunes-fn.azurewebsites.net */
  functionsOrigin: string;
  connectUpstream: (url: string, protocols: string[]) => UpstreamSocket;
  log?: (msg: string) => void;
}

/** One or more non-empty labels, then Web PubSub's own domain. */
const PUBSUB_HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.webpubsub\.azure\.com$/;

/** The client access URL if it is a plain wss URL on Azure Web PubSub's own domain; anything else is null. */
export function validPubSubUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'wss:' || url.username || url.password || url.port !== '') return null;
  return PUBSUB_HOST.test(url.hostname) ? url.href : null;
}

export function createPubSubRelay(deps: PubSubRelayDeps): {
  /** `credential` is the caller's Authorization value as authorised; `username` the display name. */
  accept(client: ClientSocket, caller: { credential: string; username: string }): Promise<void>;
} {
  const log = deps.log ?? (() => {});
  return {
    accept: (client, { credential, username }) =>
      pipe(
        client,
        async (gone) => {
          const res = await deps.fetch(`${deps.functionsOrigin}/api/connect?username=${encodeURIComponent(username)}`, {
            method: 'POST',
            headers: { Authorization: credential },
            signal: AbortSignal.timeout(SONOS_TIMEOUT_MS),
          });
          if (!res.ok) throw new Error(`connect answered ${res.status}`);
          const body: unknown = await res.json();
          const url = validPubSubUrl((body as { webPubSubUrl?: unknown } | null)?.webPubSubUrl);
          if (!url) throw new Error('connect gave no usable URL');
          if (gone()) return undefined;
          return deps.connectUpstream(url, [PUBSUB_WS_PROTOCOL]);
        },
        {
          log,
          connectFailed: '[relay] could not get a Web PubSub connection',
          upstreamError: '[relay] the Web PubSub socket reported an error',
        }
      ),
  };
}
