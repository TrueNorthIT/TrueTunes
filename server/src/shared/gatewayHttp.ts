// The HTTP half of the Sonos gateway: `ANY /sonos/api/...` is forwarded to https://play.sonos.com/api/...
// with the shared Sonos session, so the session cookie never reaches a client. The WebSocket half is
// in gatewayRelay.ts.
//
//   GET /healthz       200 { ok: true }; no sign-in, no Sonos call
//   ANY /sonos/api/*   needs `Authorization: Bearer <Entra ID token>` (always: there is no AUTH_ENFORCE
//                      loophole here); forwarded to play.sonos.com, answered unchanged
//   ANY /fn/*          the Function App, for a signed-in caller (gatewayWeb.ts)
//   GET /img?url=      artwork from a named list of hosts, for a signed-in caller (gatewayWeb.ts)
//   GET anything else  the web app's static files, when the entry point serves them (gatewayWeb.ts); else 404
//
// This is a plain function over plain objects. The Node `http` wiring, the Entra check (`verify`) and the
// Sonos session are injected, so nothing here imports Azure or touches the network by itself.
//
// Nothing secret is ever logged or returned: the session token, the Entra token and the Sonos password
// appear in no log line, and a failure is reported by name only ('sonos-login-failed', 'sonos-unreachable').
import { SonosLoginError } from './sonosSession';
import { functionsRoute, imageRoute, staticRoute, type StaticLookup, type WebRouteKit } from './gatewayWeb';

export const SONOS_ORIGIN = 'https://play.sonos.com';
export const SESSION_COOKIE = '__Secure-next-auth.session-token';
/** Sonos's BFF refuses non-browser agents, so the gateway presents itself as a browser. */
export const SPOOF_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';
export const SONOS_REFERER = `${SONOS_ORIGIN}/en-us/web-app`;
/** How long the gateway waits for Sonos before it gives up (and answers 502 sonos-unreachable). */
export const SONOS_TIMEOUT_MS = 30_000;

export interface GatewaySession {
  get(opts?: { refresh?: boolean }): Promise<string>;
}

export type Verify = (authorizationHeader: string | undefined) => Promise<{ oid: string } | null>;

export interface GatewayRequest {
  method: string;
  /** The request target as Node gives it: path and query. */
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body?: Uint8Array;
}

export interface GatewayResponse {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array | string;
}

export interface GatewayDeps {
  session: GatewaySession;
  fetch: typeof fetch;
  verify: Verify;
  log?: (msg: string) => void;
  /** The built web app's files by URL path. Without it the gateway serves no static files (404). */
  staticFile?: StaticLookup;
}

/** Request headers the gateway never forwards: the client's identity and connection details. */
const DROPPED_REQUEST_HEADERS = new Set([
  // the client's identity: the gateway supplies Cookie, User-Agent and Referer itself
  'cookie',
  'authorization',
  'proxy-authorization',
  'host',
  'origin',
  'referer',
  'user-agent',
  // where the client says it came from: meaningless to Sonos
  'forwarded',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-forwarded-port',
  'x-original-url',
  'x-real-ip',
  // hop-by-hop (RFC 9110 section 7.6.1), and the length, which fetch works out for itself
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
]);

/** Response headers not passed back: Set-Cookie (never), and those describing the wire form fetch has already undone. */
const DROPPED_RESPONSE_HEADERS = new Set([
  'set-cookie',
  'set-cookie2',
  'content-encoding',
  'content-length',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'trailer',
]);

const json = (status: number, body: unknown): GatewayResponse => ({
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
});

export function createGatewayHandler(deps: GatewayDeps): (req: GatewayRequest) => Promise<GatewayResponse> {
  const log = deps.log ?? (() => {});

  /** The headers to forward: the client's ordinary ones, filtered whatever their case. */
  function forwardedHeaders(headers: GatewayRequest['headers'], keep?: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [name, value] of Object.entries(headers)) {
      const lower = name.trim().toLowerCase();
      if (value === undefined || (DROPPED_REQUEST_HEADERS.has(lower) && lower !== keep)) continue;
      out[name] = Array.isArray(value) ? value.join(', ') : value;
    }
    return out;
  }

  function responseHeaders(upstream: Headers): Record<string, string> {
    const out: Record<string, string> = {};
    upstream.forEach((value, name) => {
      if (!DROPPED_RESPONSE_HEADERS.has(name.toLowerCase())) out[name] = value;
    });
    return out;
  }

  const web: WebRouteKit = { fetch: deps.fetch, verify: deps.verify, log, json, forwardedHeaders, responseHeaders };

  return async function handle(req: GatewayRequest): Promise<GatewayResponse> {
    const queryAt = req.url.indexOf('?');
    const path = queryAt < 0 ? req.url : req.url.slice(0, queryAt);
    const query = queryAt < 0 ? '' : req.url.slice(queryAt);

    if (req.method === 'GET' && path === '/healthz') return json(200, { ok: true });

    if (path === '/fn' || path.startsWith('/fn/')) return functionsRoute(req, path.slice('/fn/'.length), query, web);
    if (path === '/img') return imageRoute(req, query, web);

    // Under /sonos only /sonos/api/... is forwarded. Anything else, in any spelling, goes nowhere: it is the
    // web app's file if there is one, and otherwise 404.
    if (!path.startsWith('/sonos/api/')) {
      return (deps.staticFile && staticRoute(req, path, deps.staticFile)) || json(404, { error: 'not found' });
    }

    const authorization = req.headers['authorization'];
    let caller: { oid: string } | null;
    try {
      caller = await deps.verify(typeof authorization === 'string' ? authorization : undefined);
    } catch {
      log('[gateway] the token check failed; request refused');
      return json(401, { error: 'sign-in required' });
    }
    if (!caller) return json(401, { error: 'sign-in required' });

    // The upstream host is fixed. Resolving the target and checking where it landed also settles "..",
    // "%2e%2e" and backslash spellings: anything that does not end up under /api/ is refused.
    const target = new URL(`${SONOS_ORIGIN}${path.slice('/sonos'.length)}${query}`);
    if (target.origin !== SONOS_ORIGIN || !target.pathname.startsWith('/api/')) {
      return json(404, { error: 'not found' });
    }
    // next-auth's own endpoints act on the shared service session itself (/api/auth/session describes it,
    // /api/auth/signout ends it for everyone). No client has a reason to call them.
    // Compared after decoding, since "%61uth" is "auth" to the server on the other side.
    let decodedPath: string;
    try {
      decodedPath = decodeURIComponent(target.pathname).toLowerCase();
    } catch {
      return json(404, { error: 'not found' });
    }
    if (decodedPath.startsWith('/api/auth/') || decodedPath.includes('/../')) return json(404, { error: 'not found' });

    const forwarded = forwardedHeaders(req.headers);
    const hasBody = req.body !== undefined && req.body.length > 0 && req.method !== 'GET' && req.method !== 'HEAD';

    const send = (session: string): Promise<Response> =>
      deps.fetch(target.href, {
        method: req.method,
        // A redirect is the client's to see: following it would carry the session cookie to wherever it points.
        redirect: 'manual',
        headers: {
          ...forwarded,
          Cookie: `${SESSION_COOKIE}=${session}`,
          'User-Agent': SPOOF_UA,
          Referer: SONOS_REFERER,
        },
        ...(hasBody ? { body: req.body } : {}),
        signal: AbortSignal.timeout(SONOS_TIMEOUT_MS),
      });

    let upstream: Response;
    try {
      upstream = await send(await deps.session.get());
      if (upstream.status === 401) {
        // The session has expired: one refresh (concurrent 401s share it), one retry of the same request.
        upstream = await send(await deps.session.get({ refresh: true }));
      }
    } catch (err) {
      if (err instanceof SonosLoginError) {
        // The message is built from step names and statuses and is safe to log (see sonosSession.ts).
        log(`[gateway] Sonos login failed: ${err.message}`);
        return json(502, { error: 'sonos-login-failed' });
      }
      // The cause is not logged or returned: a fetch error can quote the request, cookie included.
      log('[gateway] Sonos could not be reached');
      return json(502, { error: 'sonos-unreachable' });
    }

    const headers = responseHeaders(upstream.headers);
    try {
      // shortcut: the response is buffered whole, not streamed; fine for Sonos's JSON and album art.
      return { status: upstream.status, headers, body: new Uint8Array(await upstream.arrayBuffer()) };
    } catch {
      log('[gateway] the Sonos response broke off');
      return json(502, { error: 'sonos-unreachable' });
    }
  };
}
