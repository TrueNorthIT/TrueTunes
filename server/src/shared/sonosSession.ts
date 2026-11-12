// The shared Sonos web session: the server signs in to play.sonos.com once, headlessly, with a
// service account, keeps the session token in memory and hands it to signed-in colleagues' apps.
//
// The flow is the one proven in scripts/spike-sonos-login.mjs:
//   1. next-auth: GET /api/auth/csrf, then POST /api/auth/signin/okta (returns the Okta URL)
//   2. GET the Okta authorize URL; the sign-in page embeds a `stateToken`
//   3. POST login.sonos.com/api/v1/authn with the credentials and that stateToken
//   4. follow `_links.next.href` through the next-auth callback and read the session cookie
//
// No Azure imports: `fetch` is injected, so tests run against a fake Sonos.
//
// Errors never carry the password or any response body (Okta can echo the request back):
// every failure is a SonosLoginError with a message built here from statuses and step names.

const PLAY = 'https://play.sonos.com';
const SESSION_COOKIE = '__Secure-next-auth.session-token';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const MAX_REDIRECTS = 15;

export class SonosLoginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SonosLoginError';
  }
}

export interface SonosSessionDeps {
  fetch: typeof fetch;
  username: string;
  password: string;
}

export function createSonosSession(deps: SonosSessionDeps): { get(opts?: { refresh?: boolean }): Promise<string> } {
  let cached: string | undefined;
  let inflight: Promise<string> | undefined;

  /** One sign-in's cookies, per host. A fresh jar per login so nothing stale leaks across attempts. */
  function login(): Promise<string> {
    const jar = new Map<string, Map<string, string>>();

    const cookieHeader = (url: string) =>
      [...(jar.get(new URL(url).host) ?? [])].map(([k, v]) => `${k}=${v}`).join('; ');

    const store = (url: string, res: Response) => {
      const host = new URL(url).host;
      const cookies = jar.get(host) ?? new Map<string, string>();
      jar.set(host, cookies);
      for (const setCookie of res.headers.getSetCookie()) {
        const pair = setCookie.split(';')[0] ?? '';
        const i = pair.indexOf('='); // the FIRST "=": values can end in "=="
        if (i > 0) cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
      }
    };

    async function req(step: string, url: string, init: RequestInit = {}): Promise<Response> {
      let res: Response;
      try {
        res = await deps.fetch(url, {
          redirect: 'manual',
          ...init,
          headers: { 'User-Agent': UA, Accept: '*/*', Cookie: cookieHeader(url), ...init.headers },
        });
      } catch {
        // The cause is dropped on purpose: it could quote the request.
        throw new SonosLoginError(`${step}: request failed`);
      }
      store(url, res);
      return res;
    }

    const requireOk = (step: string, res: Response) => {
      if (res.status < 200 || res.status >= 300) throw new SonosLoginError(`${step}: HTTP ${res.status}`);
    };

    async function readJson<T>(step: string, res: Response): Promise<T> {
      try {
        return (await res.json()) as T;
      } catch {
        throw new SonosLoginError(`${step}: response was not JSON`);
      }
    }

    /** Follow redirects by hand so each host's cookies land in its own jar. */
    async function follow(step: string, start: string): Promise<{ res: Response; url: string }> {
      let url = start;
      let res = await req(step, url);
      for (let hops = 0; res.status >= 300 && res.status < 400; hops++) {
        const location = res.headers.get('location');
        if (!location || hops >= MAX_REDIRECTS) throw new SonosLoginError(`${step}: bad redirect`);
        url = new URL(location, url).href; // Location can be relative
        res = await req(step, url);
      }
      return { res, url };
    }

    return (async () => {
      if (!deps.username || !deps.password) throw new SonosLoginError('Sonos service account is not configured');

      // 1. next-auth csrf, then start the Okta sign-in
      const csrfRes = await req('csrf', `${PLAY}/api/auth/csrf`);
      requireOk('csrf', csrfRes);
      const { csrfToken } = await readJson<{ csrfToken?: string }>('csrf', csrfRes);
      if (!csrfToken) throw new SonosLoginError('csrf: no csrfToken');

      const signin = await req('signin', `${PLAY}/api/auth/signin/okta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ csrfToken, callbackUrl: `${PLAY}/en-us/web-app`, json: 'true' }),
      });
      requireOk('signin', signin);
      const authorizeUrl = (await readJson<{ url?: string }>('signin', signin)).url;
      if (!authorizeUrl) throw new SonosLoginError('signin: no authorize url');

      // 2. the sign-in page, with the stateToken embedded as a JS string literal
      const { res: page, url: pageUrl } = await follow('authorize', authorizeUrl);
      requireOk('authorize', page);
      const html = await page.text();
      const rawState = /["']?stateToken["']?\s*[:=]\s*["']([^"']+)["']/.exec(html)?.[1];
      if (!rawState) throw new SonosLoginError('authorize: no stateToken in the sign-in page');
      const stateToken = rawState.replace(/\\x([0-9A-Fa-f]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));

      // 3. Okta primary authentication, bound to this authorize transaction
      const authn = await req('authn', `${new URL(pageUrl).origin}/api/v1/authn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ username: deps.username, password: deps.password, stateToken }),
      });
      requireOk('authn', authn);
      const result = await readJson<{ status?: unknown; _links?: { next?: { href?: string } } }>('authn', authn);
      if (result.status !== 'SUCCESS') {
        // Only the status word, never the body.
        const status = typeof result.status === 'string' && /^[A-Z_]{1,40}$/.test(result.status) ? result.status : 'unknown';
        throw new SonosLoginError(`authn: Okta answered ${status}, not SUCCESS`);
      }
      const next = result._links?.next?.href;
      if (!next) throw new SonosLoginError('authn: no next link');

      // 4. back through the next-auth callback
      const { res: end } = await follow('callback', next);
      if (end.status >= 400) throw new SonosLoginError(`callback: HTTP ${end.status}`);
      const cookies = jar.get(new URL(PLAY).host);
      const token = cookies?.get(SESSION_COOKIE);
      if (!token) {
        // shortcut: a session cookie next-auth splits into `.0`, `.1`… chunks (a very large session)
        // is not reassembled; this is the ceiling. Fix when it happens by joining the chunks in order.
        if ([...(cookies?.keys() ?? [])].some((k) => k.startsWith(`${SESSION_COOKIE}.`))) {
          throw new SonosLoginError('session cookie is chunked');
        }
        throw new SonosLoginError('callback: no session cookie');
      }
      return token;
    })();
  }

  /** Is the cached session still accepted by Sonos? */
  async function stillValid(token: string): Promise<boolean> {
    let res: Response;
    try {
      res = await deps.fetch(`${PLAY}/api/mfe`, {
        headers: { Cookie: `${SESSION_COOKIE}=${token}`, 'User-Agent': UA, Accept: '*/*', Referer: `${PLAY}/en-us/web-app` },
      });
    } catch {
      throw new SonosLoginError('mfe: request failed');
    }
    return res.ok;
  }

  /** Runs `work` as the one in-flight operation; concurrent callers share it. A failure is never kept. */
  function singleFlight(work: () => Promise<string>): Promise<string> {
    inflight ??= work()
      .then((token) => {
        cached = token;
        return token;
      })
      .finally(() => {
        inflight = undefined;
      });
    return inflight;
  }

  return {
    get(opts) {
      const refresh = opts?.refresh === true;
      if (cached && !refresh) return Promise.resolve(cached);
      if (inflight) return inflight;
      const stale = cached;
      return singleFlight(async () => (stale && (await stillValid(stale)) ? stale : login()));
    },
  };
}
