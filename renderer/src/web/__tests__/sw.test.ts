import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The service worker's own file (renderer/web/sw.js), run against fake events. The rules that matter: it never
// answers or stores anything for the API, the relay, sign-in, another origin or a request with Authorization;
// it serves the cached shell for page loads; and a new version waits until it is told to take over.

const source = readFileSync(join(__dirname, '..', '..', '..', 'web', 'sw.js'), 'utf8').replace(
  /\/\*__BUILD__\*\/ \{[^;]*\};/,
  `{ id: 'abc123', version: '1.2.3', shell: ['/manifest.webmanifest', '/icons/icon-192.png', '/assets/index-aaa.js'] };`
);

const ORIGIN = 'https://truetunes.tnapps.co.uk';

interface FakeRequest {
  method: string;
  url: string;
  mode: string;
  headers: Headers;
  cache?: string;
}
const req = (path: string, o: Partial<FakeRequest> & { auth?: boolean } = {}): FakeRequest => ({
  method: o.method ?? 'GET',
  url: path.startsWith('http') ? path : `${ORIGIN}${path}`,
  mode: o.mode ?? 'cors',
  headers: new Headers(o.auth ? { Authorization: 'Bearer x' } : {}),
});
const keyOf = (r: FakeRequest | string) => new URL(typeof r === 'string' ? r : r.url, ORIGIN).pathname;

function boot() {
  const listeners: Record<string, (event: never) => void> = {};
  const stores = new Map<string, Map<string, unknown>>();
  const fetched: string[] = [];
  let skipped = 0;
  let claimed = 0;
  const open = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return Promise.resolve({
      match: (r: FakeRequest | string) => Promise.resolve(store.get(keyOf(r))),
      put: (r: FakeRequest | string, res: unknown) => Promise.resolve(void store.set(keyOf(r), res)),
      addAll: (rs: FakeRequest[]) =>
        Promise.resolve(rs.forEach((r) => store.set(keyOf(r), { precached: keyOf(r), cache: r.cache }))),
    });
  };
  let windows = 1;
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: (event: never) => void) => void (listeners[type] = fn),
    skipWaiting: () => Promise.resolve(void skipped++),
    clients: {
      claim: () => Promise.resolve(void claimed++),
      matchAll: () => Promise.resolve(Array.from({ length: windows }, () => ({}))),
    },
  };
  const caches = {
    open,
    keys: () => Promise.resolve([...stores.keys()]),
    delete: (name: string) => Promise.resolve(stores.delete(name)),
  };
  const fetchFake = (r: FakeRequest) => {
    fetched.push(keyOf(r));
    return Promise.resolve({
      ok: true,
      status: 200,
      type: 'basic',
      from: 'network',
      clone: () => ({ cloned: keyOf(r) }),
    });
  };
  class FakeRequestCtor {
    url: string;
    cache?: string;
    constructor(path: string, init?: { cache?: string }) {
      this.url = `${ORIGIN}${path}`;
      this.cache = init?.cache;
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- the worker is a classic script, evaluated as one
  new Function('self', 'caches', 'fetch', 'Request', 'Response', source)(self, caches, fetchFake, FakeRequestCtor, {
    error: () => ({ error: true }),
  });

  /** Dispatches a fetch event; resolves to the response the worker answered with, or 'untouched'. */
  const dispatchFetch = async (request: FakeRequest) => {
    let answer: Promise<unknown> | undefined;
    listeners['fetch']({ request, respondWith: (p: Promise<unknown>) => void (answer = p) } as never);
    return answer === undefined ? 'untouched' : await answer;
  };
  const lifecycle = async (type: 'install' | 'activate') => {
    let work: Promise<unknown> = Promise.resolve();
    listeners[type]({ waitUntil: (p: Promise<unknown>) => void (work = p) } as never);
    await work;
  };
  /** Sends the worker a message and waits for whatever it asked the browser to wait for. */
  const message = async (data: string, open = 1) => {
    windows = open;
    let work: Promise<unknown> = Promise.resolve();
    listeners['message']({ data, ports: [], waitUntil: (p: Promise<unknown>) => void (work = p) } as never);
    await work;
  };
  return {
    listeners,
    stores,
    fetched,
    dispatchFetch,
    lifecycle,
    message,
    skipped: () => skipped,
    claimed: () => claimed,
  };
}

describe('the service worker', () => {
  let sw: ReturnType<typeof boot>;
  beforeEach(async () => {
    sw = boot();
    await sw.lifecycle('install');
  });

  it('stores the shell and the build’s files on install, fetched past the HTTP cache', () => {
    const cache = sw.stores.get('true-tunes-abc123')!;
    expect([...cache.keys()].sort()).toEqual(
      ['/assets/index-aaa.js', '/icons/icon-192.png', '/index.html', '/manifest.webmanifest'].sort()
    );
    expect(cache.get('/index.html')).toMatchObject({ cache: 'reload' });
  });

  it('does not take over on install: a new version waits', () => {
    expect(sw.skipped()).toBe(0);
  });

  it('takes over only when the page says so', () => {
    sw.listeners['message']({ data: 'something else', ports: [] } as never);
    expect(sw.skipped()).toBe(0);
    sw.listeners['message']({ data: 'activate', ports: [] } as never);
    expect(sw.skipped()).toBe(1);
  });

  it('takes over at launch when the app has one window open', async () => {
    await sw.message('activate-if-alone', 1);
    expect(sw.skipped()).toBe(1);
  });

  it('does not take over at launch while another window is open: that session keeps its version', async () => {
    await sw.message('activate-if-alone', 2);
    await sw.message('activate-if-alone', 3);
    expect(sw.skipped()).toBe(0);
  });

  it('tells the page its version when asked', () => {
    const got: unknown[] = [];
    sw.listeners['message']({ data: 'version', ports: [{ postMessage: (v: unknown) => got.push(v) }] } as never);
    expect(got).toEqual(['1.2.3']);
  });

  it('on activation drops older True Tunes caches, keeps anything else, and claims the open pages', async () => {
    sw.stores.set('true-tunes-old999', new Map());
    sw.stores.set('someone-elses-cache', new Map());
    await sw.lifecycle('activate');
    expect([...sw.stores.keys()].sort()).toEqual(['someone-elses-cache', 'true-tunes-abc123']);
    expect(sw.claimed()).toBe(1);
  });

  for (const [why, request] of [
    ['a Sonos API call', req('/sonos/api/groups/v1/households/x/groups')],
    ['a Sonos API call carrying the token', req('/sonos/api/x', { auth: true })],
    ['the relay path', req('/sonos/ws')],
    ['the Web PubSub relay path', req('/pubsub/ws?username=Alex')],
    ['anything else under /pubsub', req('/pubsub/nope')],
    ['a Functions call', req('/fn/stats?period=week')],
    ['an image through the gateway', req('/img?url=https%3A%2F%2Fwww.gstatic.com%2Fa.png')],
    ['the health check', req('/healthz')],
    ['the way back from sign-in (a page load)', req('/auth/redirect', { mode: 'navigate' })],
    ['anything with Authorization, even a build file', req('/assets/index-aaa.js', { auth: true })],
    ['a POST', req('/', { method: 'POST', mode: 'navigate' })],
    ['Microsoft sign-in', req('https://login.microsoftonline.com/common/oauth2/v2.0/token', { method: 'POST' })],
    ['an art CDN', req('https://i.ytimg.com/vi/x/hqdefault.jpg')],
    ['lyrics', req('https://lrclib.net/api/get?x=1')],
    ['a same-origin file that is not part of the build', req('/robots.txt')],
  ] as const) {
    it(`leaves ${why} to the network and stores nothing`, async () => {
      const before = new Map([...sw.stores].map(([name, store]) => [name, store.size]));
      expect(await sw.dispatchFetch(request)).toBe('untouched');
      expect(sw.fetched).toEqual([]);
      for (const [name, store] of sw.stores) expect(store.size).toBe(before.get(name));
    });
  }

  for (const path of ['/', '/demo', '/demo/', '/some/page']) {
    it(`answers a page load of ${path} with the cached shell, without the network`, async () => {
      expect(await sw.dispatchFetch(req(path, { mode: 'navigate' }))).toMatchObject({ precached: '/index.html' });
      expect(sw.fetched).toEqual([]);
    });
  }

  it('serves a build file from the cache', async () => {
    expect(await sw.dispatchFetch(req('/assets/index-aaa.js'))).toMatchObject({ precached: '/assets/index-aaa.js' });
    expect(sw.fetched).toEqual([]);
  });

  it('fetches a build file it has not seen once, then serves it from the cache', async () => {
    expect(await sw.dispatchFetch(req('/assets/Leaderboard-bbb.js'))).toMatchObject({ from: 'network' });
    await Promise.resolve();
    expect(await sw.dispatchFetch(req('/assets/Leaderboard-bbb.js'))).toEqual({ cloned: '/assets/Leaderboard-bbb.js' });
    expect(sw.fetched).toEqual(['/assets/Leaderboard-bbb.js']);
  });

  it('serves the manifest and icons from the cache', async () => {
    expect(await sw.dispatchFetch(req('/manifest.webmanifest'))).toMatchObject({ precached: '/manifest.webmanifest' });
    expect(await sw.dispatchFetch(req('/icons/icon-192.png'))).toMatchObject({ precached: '/icons/icon-192.png' });
  });
});
