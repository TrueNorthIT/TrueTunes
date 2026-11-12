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

/**
 * Who is opening the socket: the Entra token on the upgrade request, checked by `verify`. A null means
 * the upgrade is to be refused with 401 before any relay or Sonos socket exists. Fails closed.
 */
export async function authoriseUpgrade(
  headers: Record<string, string | string[] | undefined>,
  verify: Verify
): Promise<{ oid: string } | null> {
  const authorization = headers['authorization'];
  try {
    return await verify(typeof authorization === 'string' ? authorization : undefined);
  } catch {
    return null;
  }
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

/** Close codes that may be put in a close frame (RFC 6455 section 7.4.1); 1005, 1006 and 1015 may not. */
const isSendable = (code: number): boolean =>
  (code >= 1000 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006) || (code >= 3000 && code <= 4999);

const passOn = (code: number): number | undefined => (isSendable(code) ? code : undefined);

/** Frames held while the upstream is still connecting. */
const MAX_BUFFERED_FRAMES = 1000;

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
    async accept(client) {
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
          // shortcut: a client that floods the relay before Sonos answers is cut off, not slowed down.
          end({ code: 1008 }, {});
        }
      });
      client.on('close', (code) => end(undefined, { code: passOn(code) }));
      client.on('error', () => end(undefined, { code: 1011 }));

      try {
        const ticket = await fetchTicket();
        if (finished) return; // the client left while the ticket was being fetched
        upstream = deps.connectUpstream(`${SONOS_WS_URL}?ticket=${ticket}`, [SONOS_WS_PROTOCOL]);
      } catch {
        log('[relay] could not get a Sonos ticket or open the Sonos socket');
        failed();
        return;
      }

      const sonos = upstream;
      sonos.on('open', () => {
        if (finished) return;
        upstreamOpen = true;
        for (const data of early.splice(0)) {
          try {
            sonos.send(data);
          } catch {
            failed();
            return;
          }
        }
      });
      sonos.on('message', (data) => {
        if (finished) return;
        try {
          client.send(data);
        } catch {
          failed();
        }
      });
      sonos.on('error', () => {
        if (!finished) log('[relay] the Sonos socket reported an error');
        failed();
      });
      sonos.on('close', (code) => {
        // Closed before it ever opened: the connection failed. Afterwards: pass the close on.
        if (upstreamOpen) end({ code: passOn(code) }, undefined);
        else failed();
      });
    },
  };
}
