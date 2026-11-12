// play.sonos.com BFF calls with the shared office session.
//
// The session cookie lives in Redis (encrypted). NextAuth rolls it on use, so every Set-Cookie for it is
// written back; if Sonos answers 401 we sign in again with the stored credentials and retry once.

import { BASE_URL, UA } from './constants';
import { absorb, cookieHeader, isSessionCookie, type CookieJar } from './cookies';
import { loginToSonos } from './login';
import { env } from '../env';
import { errorText, log, since } from '../log';
import { kv } from '../store';
import { seal, unseal } from '../crypto';

/** Path with the long ids collapsed, plus the query, for logs. */
function describe(url: URL): string {
  const path = url.pathname.replace(
    /\/(households|groups|services|accounts|queues|albums|playlists|tracks)\/[^/]+/g,
    '/$1/:id'
  );
  const query = decodeURIComponent(url.search).slice(0, 120);
  return `${path}${query}`;
}

const SESSION_KEY = 'sonos:session';
const LOCK_KEY = 'sonos:login-lock';

let memo: { jar: CookieJar; at: number } | undefined;

async function loadJar(): Promise<CookieJar | null> {
  const sealed = await kv().get<string>(SESSION_KEY);
  if (!sealed) return null;
  try {
    return JSON.parse(await unseal(sealed)) as CookieJar;
  } catch {
    return null; // TOKEN_SECRET changed: sign in again
  }
}

async function saveJar(jar: CookieJar): Promise<void> {
  await kv().set(SESSION_KEY, await seal(JSON.stringify(jar)));
  memo = { jar, at: Date.now() };
}

async function getJar(): Promise<CookieJar> {
  if (memo && Date.now() - memo.at < 20_000) return memo.jar;
  const jar = await loadJar();
  if (jar && Object.keys(jar).length) {
    memo = { jar, at: Date.now() };
    return jar;
  }
  return signIn();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const same = (a: CookieJar | null, b: CookieJar | null) => JSON.stringify(a) === JSON.stringify(b);

/** Signs in once across all instances; the rest wait for the new cookie. `stale` is the jar that failed. */
export async function signIn(stale: CookieJar | null = null): Promise<CookieJar> {
  memo = undefined;
  const locked = await kv().set(LOCK_KEY, String(Date.now()), { nx: true, ex: 60 });
  if (locked !== 'OK') {
    for (let i = 0; i < 60; i++) {
      await sleep(500);
      const jar = await loadJar();
      if (jar && Object.keys(jar).length && !same(jar, stale)) return jar;
    }
    throw new Error('Timed out waiting for another instance to sign in to Sonos');
  }
  const started = Date.now();
  log.info('sonos', 'signing in', { reason: stale ? 'session rejected' : 'no session' });
  try {
    const jar = await loginToSonos(env.sonosUsername(), env.sonosPassword());
    await saveJar(jar);
    await kv().set('sonos:last-login', Date.now());
    log.info('sonos', 'signed in', { ms: since(started), cookies: Object.keys(jar).length });
    return jar;
  } catch (err) {
    log.error('sonos', 'sign-in failed', { error: errorText(err), ms: since(started) });
    throw err;
  } finally {
    await kv().del(LOCK_KEY);
  }
}

export class SonosHttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export interface SonosResponse<T = unknown> {
  data: T;
  etag?: string;
}

interface Options {
  method?: 'GET' | 'POST' | 'DELETE' | 'PATCH';
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
}

export async function sonosHttp<T = unknown>(
  path: string,
  opts: Options = {},
  retried = false
): Promise<SonosResponse<T>> {
  const method = opts.method ?? 'GET';
  const url = new URL(path, BASE_URL);
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));

  const jar = await getJar();
  const started = Date.now();
  let res: Response | undefined;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(url, {
      method,
      headers: {
        Cookie: cookieHeader(jar),
        'User-Agent': UA,
        Accept: '*/*',
        Referer: `${BASE_URL}/en-us/web-app`,
        'X-Sonos-Timezone': '+00:00',
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...opts.headers,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    // Only GETs are retried: queue writes carry If-Match etags that a blind replay would trip over.
    if (method === 'GET' && attempt < 2 && [500, 502, 503, 504].includes(res.status)) {
      log.warn('sonos-http', `${method} ${describe(url)}`, { status: res.status, retry: attempt + 1 });
      await sleep(300 * (attempt + 1));
      continue;
    }
    break;
  }
  const outcome = { status: res.status, ms: since(started) };
  if (res.ok) log.info('sonos-http', `${method} ${describe(url)}`, outcome);
  else log.warn('sonos-http', `${method} ${describe(url)}`, outcome);

  // NextAuth rolls the session cookie; keep whatever it hands back.
  const rolled = { ...jar };
  if (absorb(rolled, res.headers.getSetCookie(), isSessionCookie) && Object.keys(rolled).length) {
    await saveJar(rolled);
    log.info('sonos', 'session cookie rolled');
  }

  if (res.status === 401 && !retried) {
    await signIn(jar);
    return sonosHttp<T>(path, opts, true);
  }

  const text = await res.text();
  if (!res.ok)
    throw new SonosHttpError(res.status, `Sonos ${method} ${url.pathname} → ${res.status}: ${text.slice(0, 300)}`);
  const etag = res.headers.get('etag') ?? undefined;
  if (!text) return { data: null as T, etag };
  try {
    return { data: JSON.parse(text) as T, etag };
  } catch {
    throw new SonosHttpError(res.status, `Sonos ${url.pathname} did not return JSON`);
  }
}

export async function lastLogin(): Promise<number | null> {
  return (await kv().get<number>('sonos:last-login')) ?? null;
}

export async function hasSession(): Promise<boolean> {
  return (await kv().exists(SESSION_KEY)) === 1;
}
