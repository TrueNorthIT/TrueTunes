// Test helpers for the shared Sonos web session (server/src/shared/sonosSession.ts and
// server/src/functions/sonos-session.ts): a stateful fake of play.sonos.com + login.sonos.com
// that you hand in as `fetch`, plus fake HTTP requests and a context that records its logs.
//
// The fake speaks the four-step flow proven in scripts/spike-sonos-login.mjs:
//   1. GET  play.sonos.com/api/auth/csrf                       -> { csrfToken } + csrf cookie
//      POST play.sonos.com/api/auth/signin/okta (form)         -> { url } of the Okta authorize page
//   2. GET  login.sonos.com/oauth2/.../authorize -> 302 -> GET login.sonos.com/signin
//                                                              -> HTML embedding "stateToken":"...\x2D..."
//   3. POST login.sonos.com/api/v1/authn (JSON)                -> { status, _links.next.href }
//   4. GET  _links.next.href -> 302 -> GET play.sonos.com/api/auth/callback/okta
//                                                              -> Set-Cookie __Secure-next-auth.session-token
// and the validity check GET play.sonos.com/api/mfe with that cookie (2xx when Sonos accepts it).
//
// It behaves like fetch(..., { redirect: 'manual' }): redirects come back as 3xx responses, so
// the caller must follow them by hand and carry cookies itself. Like next-auth it refuses the
// sign-in POST without the csrf cookie, and the callback without the state and PKCE cookies
// set by the sign-in POST (it then redirects with an error and no session cookie).
// Every response arrives one macrotask late, so concurrent callers genuinely overlap.
import type { HttpRequest, InvocationContext } from '@azure/functions';

export const SONOS_USERNAME = 'office-service@example.test';
export const SONOS_PASSWORD = 'Tr0ub4dor&3-not-a-real-password';
export const SESSION_COOKIE = '__Secure-next-auth.session-token';

const PLAY = 'https://play.sonos.com';
const IDP = 'https://login.sonos.com';

/** Ways the Sonos side can fail to produce a session, switched on via `sonos.fault`. */
export type LoginFault =
  | 'mfa-required' // authn answers 200 { status: 'MFA_REQUIRED' }
  | 'locked-out' // authn answers 200 { status: 'LOCKED_OUT' }
  | 'no-state-token' // the login page carries no stateToken
  | 'no-session-cookie' // the callback redirects happily but sets no session cookie
  | 'play-unavailable'; // play.sonos.com answers the csrf request with 503

export interface SonosCall {
  method: string;
  url: URL;
  headers: Headers;
  body: string;
}

function parseCookies(header: string | null): Map<string, string> {
  const jar = new Map<string, string>();
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) jar.set(part.slice(0, i).trim(), part.slice(i + 1).trim());
  }
  return jar;
}

export function createFakeSonos(creds: { username: string; password: string } = { username: SONOS_USERNAME, password: SONOS_PASSWORD }) {
  const validTokens = new Set<string>();
  const requests: SonosCall[] = [];
  const counts = {
    /** Sign-ins started (GET /api/auth/csrf). */
    loginAttempts: 0,
    /** Credentials presented to Okta (POST /api/v1/authn). */
    authnPosts: 0,
    /** Session tokens Sonos has minted, i.e. logins that succeeded. */
    sessionsIssued: 0,
    /** GET /api/mfe validity checks. */
    mfeChecks: 0,
  };
  const sonos = {
    requests,
    counts,
    /** Set (and clear again) at any time to change how the next logins behave. */
    fault: null as LoginFault | null,
    /** When true, Okta's error bodies echo the raw request (so a leak into an error message is visible). */
    echoCredentials: false,
    /** Sonos stops accepting every session it has issued (the next /api/mfe check answers 401). */
    expireAllSessions: () => validTokens.clear(),
    isValid: (token: string) => validTokens.has(token),
    fetch: undefined as unknown as typeof fetch,
  };

  const respond = (url: URL, status: number, body: string | null, headers: Record<string, string> = {}, cookies: string[] = []) => {
    const h = new Headers(headers);
    for (const c of cookies) h.append('set-cookie', c);
    const res = new Response(body, { status, headers: h });
    Object.defineProperty(res, 'url', { value: url.href });
    return res;
  };
  const json = (url: URL, status: number, body: unknown, cookies: string[] = []) =>
    respond(url, status, JSON.stringify(body), { 'content-type': 'application/json' }, cookies);
  const html = (url: URL, body: string) => respond(url, 200, body, { 'content-type': 'text/html' });
  const redirect = (url: URL, location: string, cookies: string[] = []) => respond(url, 302, null, { location }, cookies);

  sonos.fetch = (async (input: Parameters<typeof fetch>[0], init: RequestInit = {}) => {
    await new Promise<void>((done) => setImmediate(done));
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = (init.method ?? 'GET').toUpperCase();
    const headers = new Headers(init.headers);
    const body = init.body == null ? '' : String(init.body);
    requests.push({ method, url, headers, body });
    const cookies = parseCookies(headers.get('cookie'));

    switch (`${method} ${url.origin}${url.pathname}`) {
      // ── 1. next-auth: csrf, then start the Okta sign-in ───────────────────────
      case `GET ${PLAY}/api/auth/csrf`: {
        const n = ++counts.loginAttempts;
        if (sonos.fault === 'play-unavailable') return respond(url, 503, 'Service Unavailable');
        return json(url, 200, { csrfToken: `csrf-${n}` }, [
          `__Host-next-auth.csrf-token=csrf-${n}%7Chash; Path=/; HttpOnly; Secure; SameSite=Lax`,
        ]);
      }
      case `POST ${PLAY}/api/auth/signin/okta`: {
        const form = new URLSearchParams(body);
        const csrf = form.get('csrfToken') ?? '';
        if (!csrf || !(cookies.get('__Host-next-auth.csrf-token') ?? '').startsWith(`${csrf}%7C`)) {
          return json(url, 403, { error: 'MissingCSRF' });
        }
        const n = csrf.replace('csrf-', '');
        const authorize = `${IDP}/oauth2/default/v1/authorize?client_id=sonos-web&state=st-${n}`;
        if (form.get('json') !== 'true') return redirect(url, authorize);
        return json(url, 200, { url: authorize }, [
          `__Secure-next-auth.state=st-${n}; Path=/; HttpOnly; Secure; SameSite=Lax`,
          `__Secure-next-auth.pkce.code_verifier=cv-${n}; Path=/; HttpOnly; Secure; SameSite=Lax`,
        ]);
      }

      // ── 2. Okta authorize -> sign-in page with the embedded stateToken ────────
      case `GET ${IDP}/oauth2/default/v1/authorize`: {
        const n = (url.searchParams.get('state') ?? '').replace('st-', '');
        return redirect(url, `${IDP}/signin?txn=${n}`);
      }
      case `GET ${IDP}/signin`: {
        if (sonos.fault === 'no-state-token') return html(url, '<html><body><h1>Sign in</h1></body></html>');
        const n = url.searchParams.get('txn');
        // Okta embeds the token as a JS string literal, with "-" written as the escape \x2D.
        const embedded = `state\\x2Dtoken\\x2D${n}`;
        return html(url, `<html><script>var signInConfig = {"baseUrl":"${IDP}","stateToken":"${embedded}"};</script></html>`);
      }

      // ── 3. Okta Classic primary authentication ────────────────────────────────
      case `POST ${IDP}/api/v1/authn`: {
        counts.authnPosts++;
        if (!(headers.get('content-type') ?? '').includes('application/json')) {
          return json(url, 415, { errorSummary: 'Unsupported Media Type' });
        }
        let payload: { username?: string; password?: string; stateToken?: string };
        try {
          payload = JSON.parse(body);
        } catch {
          return json(url, 400, { errorSummary: 'Bad request' });
        }
        const echo = sonos.echoCredentials ? ` Request was: ${body}` : '';
        const txn = /^state-token-(\d+)$/.exec(payload.stateToken ?? '')?.[1];
        if (!txn) return json(url, 401, { errorCode: 'E0000011', errorSummary: `Invalid token provided.${echo}` });
        if (payload.username !== creds.username || payload.password !== creds.password) {
          return json(url, 401, { errorCode: 'E0000004', errorSummary: `Authentication failed.${echo}` });
        }
        if (sonos.fault === 'mfa-required') {
          return json(url, 200, {
            status: 'MFA_REQUIRED',
            stateToken: payload.stateToken,
            _embedded: { factors: [{ factorType: 'push' }] },
            ...(echo ? { _debug: body } : {}),
          });
        }
        if (sonos.fault === 'locked-out') {
          return json(url, 200, { status: 'LOCKED_OUT', ...(echo ? { _debug: body } : {}) });
        }
        return json(url, 200, { status: 'SUCCESS', _links: { next: { href: `${IDP}/login/token/redirect?txn=${txn}` } } });
      }

      // ── 4. back through the next-auth callback ────────────────────────────────
      case `GET ${IDP}/login/token/redirect`: {
        const n = url.searchParams.get('txn');
        return redirect(url, `${PLAY}/api/auth/callback/okta?code=code-${n}&state=st-${n}`);
      }
      case `GET ${PLAY}/api/auth/callback/okta`: {
        const state = url.searchParams.get('state');
        if (!state || cookies.get('__Secure-next-auth.state') !== state || !cookies.has('__Secure-next-auth.pkce.code_verifier')) {
          return redirect(url, '/en-us/web-app?error=OAuthCallback'); // relative Location, as next-auth sends
        }
        if (sonos.fault === 'no-session-cookie') return redirect(url, '/en-us/web-app');
        // The value ends in "==" so a cookie parser that splits on every "=" corrupts it.
        const token = `sonos-jwe-${++counts.sessionsIssued}.AbCdEf==`;
        validTokens.add(token);
        return redirect(url, '/en-us/web-app', [
          `${SESSION_COOKIE}=${token}; Path=/; Expires=Fri, 11 Dec 2026 12:00:00 GMT; HttpOnly; Secure; SameSite=Lax`,
          `__Secure-next-auth.callback-url=https%3A%2F%2Fplay.sonos.com; Path=/; Secure; SameSite=Lax`,
        ]);
      }
      case `GET ${PLAY}/en-us/web-app`:
        return html(url, '<html><body>Sonos</body></html>');

      // ── the validity check the Sonos app itself uses ──────────────────────────
      case `GET ${PLAY}/api/mfe`: {
        counts.mfeChecks++;
        return validTokens.has(cookies.get(SESSION_COOKIE) ?? '') ? json(url, 200, {}) : json(url, 401, { error: 'unauthorised' });
      }
      default:
        return respond(url, 404, 'not found');
    }
  }) as typeof fetch;

  return sonos;
}

export type FakeSonos = ReturnType<typeof createFakeSonos>;

/** A GET to /api/sonos-session; `query` is e.g. 'refresh=1'. */
export function sonosRequest(authorization?: string, query = ''): HttpRequest {
  const headers = new Headers(authorization ? { authorization } : {});
  return {
    headers,
    method: 'GET',
    url: `https://fn.example/api/sonos-session${query ? `?${query}` : ''}`,
    query: new URLSearchParams(query),
  } as unknown as HttpRequest;
}

/** An invocation context whose log, warn and error output is collected as text. */
export function recordingContext() {
  const logs: string[] = [];
  const text = (a: unknown[]) =>
    a.map((x) => (x instanceof Error ? `${x.message}\n${x.stack}` : typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' ');
  const record = (...a: unknown[]) => void logs.push(text(a));
  const ctx = { log: record, info: record, warn: record, error: record } as unknown as InvocationContext;
  return { ctx, logs };
}
