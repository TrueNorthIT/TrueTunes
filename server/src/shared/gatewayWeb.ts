// The web-app half of the gateway: what a browser needs so that the True Tunes web app lives on one origin.
// gatewayHttp.ts routes to these; the Sonos half stays there.
//
//   ANY /fn/<rest>    forwarded to the Function App's /api/<rest> for a signed-in caller. The caller's own
//                     Authorization header goes through untouched and the gateway adds nothing: the functions
//                     decide what that caller may do, exactly as when the desktop app calls them.
//   GET /img?url=     artwork from a short list of hosts that browsers cannot read for themselves.
//   GET <file>        the built web app, when the entry point gives a `staticFile` lookup.
//
// Like the rest of the gateway these are plain functions over plain objects; nothing here touches the disk or
// the network except through what is passed in.
import type { GatewayRequest, GatewayResponse, Verify } from './gatewayHttp';

export const FUNCTIONS_ORIGIN = 'https://truetunes-fn.azurewebsites.net';
/** A cold start on the consumption plan can take a while. */
export const FUNCTIONS_TIMEOUT_MS = 60_000;

/**
 * Artwork hosts the image path will fetch from: the ones the app shows art from that do not (or may not) let a
 * browser read their images. Exact host names; adding one here is the only way to widen the path.
 */
export const IMAGE_HOSTS: readonly string[] = [
  'www.gstatic.com',
  'lh3.googleusercontent.com',
  'yt3.googleusercontent.com',
  'music.youtube.com',
  'mosaic.scdn.co',
];
export const IMAGE_TIMEOUT_MS = 15_000;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** A file of the built web app, as the entry point's lookup returns it. */
export interface StaticFile {
  body: Uint8Array;
  /** The Content-Type to serve it with. */
  type: string;
  /** The same bytes brotli-compressed, when that is worth sending. */
  br?: Uint8Array;
}

export type StaticLookup = (path: string) => StaticFile | null;

/** What gatewayHttp.ts lends these routes, so the two files share one set of header rules. */
export interface WebRouteKit {
  fetch: typeof fetch;
  verify: Verify;
  log: (msg: string) => void;
  json: (status: number, body: unknown) => GatewayResponse;
  /** The client's headers minus its identity and hop-by-hop ones; `keep` names ones to let through anyway. */
  forwardedHeaders: (headers: GatewayRequest['headers'], keep?: string) => Record<string, string>;
  /** An upstream's response headers minus Set-Cookie and the wire-form ones. */
  responseHeaders: (headers: Headers) => Record<string, string>;
}

async function callerOf(req: GatewayRequest, kit: WebRouteKit): Promise<{ oid: string } | null> {
  const authorization = req.headers['authorization'];
  try {
    return await kit.verify(typeof authorization === 'string' ? authorization : undefined);
  } catch {
    kit.log('[gateway] the token check failed; request refused');
    return null;
  }
}

/** `/fn/<rest>`: `rest` is the path after "/fn/", `query` is "" or "?...". */
export async function functionsRoute(
  req: GatewayRequest,
  rest: string,
  query: string,
  kit: WebRouteKit
): Promise<GatewayResponse> {
  const notFound = kit.json(404, { error: 'not found' });
  // "%25" is an encoded "%": nothing the app calls needs one, and it is how a name is hidden from the check below
  // if anything upstream decodes twice.
  if (!rest || /%25/i.test(rest)) return notFound;

  // The upstream host is fixed; resolving the target settles "..", "%2e%2e" and backslash spellings.
  const target = new URL(`${FUNCTIONS_ORIGIN}/api/${rest}${query}`);
  if (target.origin !== FUNCTIONS_ORIGIN || !target.pathname.startsWith('/api/')) return notFound;
  let decoded: string;
  try {
    decoded = decodeURIComponent(target.pathname).toLowerCase();
  } catch {
    return notFound;
  }
  // sonos-session hands the Sonos session to the desktop's direct mode. A browser must never hold it, so the
  // gateway does not forward it, however the path is spelled.
  if (decoded.includes('/../') || decoded.includes('sonos-session')) return notFound;

  if (!(await callerOf(req, kit))) return kit.json(401, { error: 'sign-in required' });

  const hasBody = req.body !== undefined && req.body.length > 0 && req.method !== 'GET' && req.method !== 'HEAD';
  let upstream: Response;
  try {
    upstream = await kit.fetch(target.href, {
      method: req.method,
      redirect: 'manual',
      headers: kit.forwardedHeaders(req.headers, 'authorization'),
      ...(hasBody ? { body: req.body } : {}),
      signal: AbortSignal.timeout(FUNCTIONS_TIMEOUT_MS),
    });
    return {
      status: upstream.status,
      headers: {
        ...kit.responseHeaders(upstream.headers),
        // These answers are data on the app's own origin: never to be sniffed or run as a page.
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
      },
      body: new Uint8Array(await upstream.arrayBuffer()),
    };
  } catch {
    // The cause is not logged or returned: a fetch error can quote the request, token included.
    kit.log('[gateway] the Function App could not be reached');
    return kit.json(502, { error: 'functions-unreachable' });
  }
}

/** `GET /img?url=<https URL on IMAGE_HOSTS>`. */
export async function imageRoute(req: GatewayRequest, query: string, kit: WebRouteKit): Promise<GatewayResponse> {
  if (req.method !== 'GET') return kit.json(405, { error: 'method not allowed' });
  const raw = new URLSearchParams(query.slice(1)).get('url');
  if (!raw) return kit.json(400, { error: 'bad url' });
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return kit.json(400, { error: 'bad url' });
  }
  // Checked before the token, so "not on the list" is the answer whoever asks.
  if (
    target.protocol !== 'https:' ||
    target.port !== '' ||
    target.username !== '' ||
    target.password !== '' ||
    !IMAGE_HOSTS.includes(target.hostname)
  ) {
    return kit.json(403, { error: 'host not allowed' });
  }

  if (!(await callerOf(req, kit))) return kit.json(401, { error: 'sign-in required' });

  const failed = kit.json(502, { error: 'image-unavailable' });
  try {
    // Nothing of the caller's goes to the image host: no token, cookie, agent or referrer.
    const upstream = await kit.fetch(target.href, {
      method: 'GET',
      // A redirect could point anywhere, which would make this an open proxy after all.
      redirect: 'manual',
      headers: { Accept: 'image/*' },
      signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
    });
    if (upstream.status === 404) return kit.json(404, { error: 'not found' });
    const type = upstream.headers.get('content-type') ?? '';
    if (upstream.status !== 200 || !/^image\//i.test(type)) return failed;
    if (Number(upstream.headers.get('content-length') ?? 0) > MAX_IMAGE_BYTES) return failed;
    // ponytail: buffered whole before the cap is applied when there is no Content-Length. Stream and abort if a
    // host outside Google's and Spotify's CDNs is ever listed.
    const body = new Uint8Array(await upstream.arrayBuffer());
    if (body.length > MAX_IMAGE_BYTES) return failed;
    return {
      status: 200,
      headers: {
        'content-type': type,
        'cache-control': 'private, max-age=86400',
        'x-content-type-options': 'nosniff',
        // An SVG opened from this origin must not be able to run as the app.
        'content-security-policy': "default-src 'none'; sandbox",
      },
      body,
    };
  } catch {
    return failed;
  }
}

/** First path segments that belong to the API: a miss under them is a 404, never the app shell. */
const RESERVED = new Set(['sonos', 'fn', 'img', 'healthz']);
/** Files a browser must revalidate every time, so a new deploy is seen at once. */
const NO_CACHE = new Set(['/index.html', '/sw.js', '/manifest.webmanifest']);
const SHELL = '/index.html';

/**
 * The web app's files. `/` and paths with no file extension are the app shell (the app routes in the browser);
 * a missing file with an extension is a miss. Null means "not mine": the caller answers 404.
 */
export function staticRoute(req: GatewayRequest, path: string, lookup: StaticLookup): GatewayResponse | null {
  if (req.method !== 'GET' && req.method !== 'HEAD') return null;
  if (RESERVED.has(path.split('/')[1] ?? '')) return null;

  let served = path === '/' ? SHELL : path;
  let file = lookup(served);
  if (!file) {
    if (path.slice(path.lastIndexOf('/') + 1).includes('.')) return null;
    served = SHELL;
    file = lookup(SHELL);
    if (!file) return null;
  }

  const acceptsBr = /(^|,)\s*br\s*(;|,|$)/i.test(String(req.headers['accept-encoding'] ?? ''));
  const compressed = acceptsBr && file.br ? file.br : undefined;
  const html = /^text\/html/i.test(file.type);
  return {
    status: 200,
    headers: {
      'content-type': file.type,
      'cache-control': NO_CACHE.has(served)
        ? 'no-cache'
        : served.startsWith('/assets/')
          ? 'public, max-age=31536000, immutable'
          : 'public, max-age=3600',
      'x-content-type-options': 'nosniff',
      ...(file.br ? { vary: 'Accept-Encoding' } : {}),
      ...(compressed ? { 'content-encoding': 'br' } : {}),
      // frame-ancestors cannot be set from a <meta> tag; the rest of the page's policy is in index.html.
      ...(html ? { 'content-security-policy': "frame-ancestors 'none'", 'referrer-policy': 'no-referrer' } : {}),
    },
    body: req.method === 'HEAD' ? new Uint8Array(0) : (compressed ?? file.body),
  };
}
