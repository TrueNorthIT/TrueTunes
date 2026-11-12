import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { OPERATIONS } from '../sonosHttp';
import { BASE, fakeAuth, json, text, makeBridge, startReady, type Harness } from './helpers';

afterEach(() => vi.useRealTimers());

// ─── the operation table cannot drift from the desktop's ─────────────────────────

describe('operation table', () => {
  it('matches src/sonos-api.ts entry for entry', () => {
    const source = readFileSync(fileURLToPath(new URL('../../../../../src/sonos-api.ts', import.meta.url)), 'utf8');
    const table = source.slice(source.indexOf('const OPERATIONS'), source.indexOf('// ─── URL builder'));
    const desktop: Record<string, { method: string; path: string }> = {};
    const re = /(\w+):\s*\{\s*method:\s*'(\w+)',\s*path:\s*'([^']+)',?\s*\}/g;
    for (const m of table.matchAll(re)) desktop[m[1]] = { method: m[2], path: m[3] };
    expect(Object.keys(desktop).length).toBeGreaterThan(25);
    expect(OPERATIONS).toEqual(desktop);
  });
});

const SERVICE = { serviceId: '72711', accountId: '9' };
const REGISTRATIONS = '/sonos/api/content/v1/households/HH1/integrations/registrations';
const ROOT = '/sonos/api/content/v2/households/HH1/services/72711/accounts/9/containers/root/browse';

describe('fetch', () => {
  it('sends Entra bearer, the Sonos headers and the right URL', async () => {
    const h = makeBridge();
    h.fake.on('GET', '/sonos/api/groups/v1/households/HH1/groups', () => json({ groups: [] }, 200, { etag: '"e1"' }));
    const r = await h.bridge.fetch({ operationId: 'getGroups', pathParams: { householdId: 'HH1' } });
    expect(r).toEqual({ data: { groups: [] }, etag: '"e1"' });
    const [c] = h.fake.to('/sonos/api/groups/v1/households/HH1/groups');
    expect(c.url).toBe(`${BASE}/sonos/api/groups/v1/households/HH1/groups`);
    expect(c.method).toBe('GET');
    expect(c.headers).toMatchObject({
      authorization: 'Bearer tok-1',
      'x-sonos-timezone': '+01:00',
      'x-sonos-debug': 'use-section-text=true',
      accept: '*/*',
    });
    expect(c.headers['content-type']).toBeUndefined();
  });

  it('with no gateway base the URL is same-origin', async () => {
    const h = makeBridge({ gatewayBase: '' });
    h.fake.on('GET', '/sonos/api/mfe', () => json({ a: 1 }));
    expect(await h.bridge.fetch({ operationId: 'getMfe' })).toEqual({ data: { a: 1 } });
    expect(h.fake.calls[0].url).toBe('/sonos/api/mfe');
  });

  it('encodes path params and query, drops undefined query values, and fills the platform defaults', async () => {
    const h = makeBridge();
    h.fake.on('GET', /history/, () => json({ items: [] }));
    await h.bridge.fetch({
      operationId: 'getHistory',
      pathParams: { householdId: 'a b' },
      query: { x: 'c&d', y: undefined },
    });
    expect(h.fake.calls[0].path).toBe(
      '/sonos/api/content/v1/households/a%20b/services/16751367/accounts/123209393/history?x=c%26d'
    );
  });

  it('sends a JSON body with Content-Type, request headers last', async () => {
    const h = makeBridge();
    h.fake.on('POST', /resources/, () => text('', 200));
    const r = await h.bridge.fetch({
      operationId: 'addQueueResource',
      pathParams: { groupId: 'G', queueId: 'Q' },
      body: { a: 1 },
      headers: { 'If-Match': '"e"', Accept: 'application/json' },
    });
    expect(r).toEqual({ data: null });
    const c = h.fake.calls[0];
    expect(c.headers['content-type']).toBe('application/json');
    expect(c.headers['if-match']).toBe('"e"');
    expect(c.headers['accept']).toBe('application/json');
    expect(c.json()).toEqual({ a: 1 });
  });

  it('uses the queue id set by setQueueId, and ignores an empty one', async () => {
    const h = makeBridge();
    h.fake.on('GET', /resources/, () => json({}));
    await h.bridge.setQueueId('RINCON_Q');
    await h.bridge.setQueueId('');
    await h.bridge.fetch({ operationId: 'getQueueResources', pathParams: { groupId: 'G' } });
    expect(h.fake.calls[0].path).toContain('/queues/RINCON_Q/resources');
  });

  it('answers each failure with the desktop strings', async () => {
    const h = makeBridge();
    expect(await h.bridge.fetch({ operationId: 'nope' as unknown as 'getMfe' })).toEqual({
      error: 'Unknown operation: nope',
    });
    expect(await h.bridge.fetch({ operationId: 'getGroups' })).toEqual({ error: 'Missing path param: householdId' });

    h.fake.on('GET', '/sonos/api/mfe', () => text('boom', 418));
    expect(await h.bridge.fetch({ operationId: 'getMfe' })).toEqual({ error: '418 : boom' });

    h.fake.on('GET', '/sonos/api/mfe', () => text('<html>', 200));
    expect(await h.bridge.fetch({ operationId: 'getMfe' })).toEqual({ error: 'Response is not JSON (200 )' });

    h.fake.on('GET', '/sonos/api/mfe', () => text('x'.repeat(500), 403));
    const r = await h.bridge.fetch({ operationId: 'getMfe' });
    expect(r.error).toBe(`403 : ${'x'.repeat(200)}`);
  });

  it('says to sign in when there is no token, without calling out', async () => {
    const h = makeBridge({ auth: fakeAuth({ token: null }) });
    expect(await h.bridge.fetch({ operationId: 'getMfe' })).toEqual({ error: 'No Entra token — please sign in first' });
    expect(h.fake.calls).toHaveLength(0);
  });

  it('reports a network failure after the retries', async () => {
    vi.useFakeTimers();
    const h = makeBridge();
    h.fake.on('GET', '/sonos/api/mfe', () => Promise.reject(new TypeError('offline')));
    const p = h.bridge.fetch({ operationId: 'getMfe' });
    await vi.advanceTimersByTimeAsync(250 + 750);
    expect(await p).toEqual({ error: 'Fetch failed: offline' });
    expect(h.fake.calls).toHaveLength(3);
  });
});

// ─── retries ─────────────────────────────────────────────────────────────────────

describe('retries', () => {
  it('retries a GET on 503 after 250 ms then 750 ms, then succeeds', async () => {
    vi.useFakeTimers();
    const h = makeBridge();
    let n = 0;
    h.fake.on('GET', '/sonos/api/mfe', () => (++n < 3 ? text('', 503) : json({ ok: 1 })));
    const p = h.bridge.fetch({ operationId: 'getMfe' });
    await vi.advanceTimersByTimeAsync(249);
    expect(h.fake.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.fake.calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(749);
    expect(h.fake.calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(await p).toEqual({ data: { ok: 1 } });
  });

  it.each([500, 502, 504])('retries a GET on %i and returns the last failure', async (status) => {
    vi.useFakeTimers();
    const h = makeBridge();
    h.fake.on('GET', '/sonos/api/mfe', () => text('down', status));
    const p = h.bridge.fetch({ operationId: 'getMfe' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(await p).toEqual({ error: `${status} : down` });
    expect(h.fake.calls).toHaveLength(3);
  });

  it('never retries anything but a GET', async () => {
    const h = makeBridge();
    h.fake.on('POST', /\/pause$/, () => text('', 503));
    h.fake.on('PATCH', /resources/, () => text('', 502));
    h.fake.on('DELETE', /resources/, () => Promise.reject(new Error('reset')));
    const g = { groupId: 'G', queueId: 'Q' };
    expect((await h.bridge.fetch({ operationId: 'pause', pathParams: g })).error).toMatch(/^503/);
    expect((await h.bridge.fetch({ operationId: 'reorderQueueResources', pathParams: g })).error).toMatch(/^502/);
    expect((await h.bridge.fetch({ operationId: 'deleteQueueResources', pathParams: g })).error).toBe(
      'Fetch failed: reset'
    );
    expect(h.fake.calls).toHaveLength(3);
  });

  it('does not retry a 4xx', async () => {
    const h = makeBridge();
    h.fake.on('GET', '/sonos/api/mfe', () => text('', 404));
    await h.bridge.fetch({ operationId: 'getMfe' });
    expect(h.fake.calls).toHaveLength(1);
  });
});

// ─── 401 ─────────────────────────────────────────────────────────────────────────

describe('401 from the gateway', () => {
  it('retries once with a force-refreshed token', async () => {
    const auth = fakeAuth({ token: 'old', refreshed: 'new' });
    const h = makeBridge({ auth });
    let n = 0;
    h.fake.on('GET', '/sonos/api/mfe', () => (++n === 1 ? text('', 401) : json({ ok: 1 })));
    expect(await h.bridge.fetch({ operationId: 'getMfe' })).toEqual({ data: { ok: 1 } });
    expect(auth.idTokenCalls).toEqual([undefined, { forceRefresh: true }]);
    expect(h.fake.calls.map((c) => c.headers['authorization'])).toEqual(['Bearer old', 'Bearer new']);
  });

  it('a second 401 fires auth expired and failed, and answers an error', async () => {
    const h = makeBridge();
    h.fake.on('GET', '/sonos/api/mfe', () => text('', 401));
    const expired = vi.fn();
    const failed = vi.fn();
    h.bridge.onAuthExpired(expired);
    h.bridge.onAuthFailed(failed);
    expect(await h.bridge.fetch({ operationId: 'getMfe' })).toEqual({
      error: '401 Unauthorized — gateway refused the request',
    });
    expect(h.fake.calls).toHaveLength(2);
    expect(expired).toHaveBeenCalledTimes(1);
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it('gives up with no second call when the refresh yields no token', async () => {
    const auth = fakeAuth({ token: 'old', refreshed: null });
    const h = makeBridge({ auth });
    h.fake.on('GET', '/sonos/api/mfe', () => text('', 401));
    const r = await h.bridge.fetch({ operationId: 'getMfe' });
    expect(r.error).toMatch(/^401/);
    expect(h.fake.calls).toHaveLength(1);
  });
});

// ─── service self-heal ───────────────────────────────────────────────────────────

/** Boots the bridge with a household but no service: the first registrations answer is empty. */
async function bootWithoutService(h: Harness) {
  let first = true;
  h.fake.on('GET', REGISTRATIONS, () => {
    if (first) {
      first = false;
      return json([]);
    }
    return json([
      { 'service-id': '16751367', 'account-id': 'x' },
      { 'service-id': '72711', 'account-id': '9' },
    ]);
  });
  await startReady(h);
  h.fake.calls.length = 0;
}

describe('service discovery', () => {
  it('finds the service on demand when serviceId is missing, then retries', async () => {
    const h = makeBridge();
    await bootWithoutService(h);
    h.fake.on('GET', /albums\/AL\/browse/, () => json({ album: 1 }));
    const r = await h.bridge.fetch({ operationId: 'browseAlbum', pathParams: { albumId: 'AL' } });
    expect(r).toEqual({ data: { album: 1 } });
    // the platform service is skipped; the first candidate whose root browse works is chosen
    expect(h.fake.calls.map((c) => c.path.split('?')[0])).toEqual([
      REGISTRATIONS,
      ROOT,
      '/sonos/api/content/v2/households/HH1/services/72711/accounts/9/albums/AL/browse',
    ]);
    expect(h.fake.calls[1].query.get('muse2')).toBe('true');
  });

  it('coalesces concurrent discoveries onto one registrations request', async () => {
    const h = makeBridge();
    await bootWithoutService(h);
    h.fake.on('GET', /albums/, () => json({}));
    await Promise.all([
      h.bridge.fetch({ operationId: 'browseAlbum', pathParams: { albumId: '1' } }),
      h.bridge.fetch({ operationId: 'browseAlbum', pathParams: { albumId: '2' } }),
    ]);
    expect(h.fake.to(REGISTRATIONS)).toHaveLength(1);
  });

  it('falls back to the first candidate when no probe succeeds', async () => {
    const h = makeBridge();
    await bootWithoutService(h);
    h.fake.on('GET', ROOT, () => text('', 404));
    h.fake.on('GET', /albums\/AL\/browse/, () => json({}));
    await h.bridge.fetch({ operationId: 'browseAlbum', pathParams: { albumId: 'AL' } });
    expect(h.fake.calls.at(-1)?.path).toContain('/services/72711/accounts/9/albums/AL/browse');
  });

  it('re-selects the service once on ERROR_SERVICE_NOT_CONFIGURED', async () => {
    const h = makeBridge();
    await startReady(h);
    h.fake.calls.length = 0;
    let browses = 0;
    h.fake.on('GET', /albums\/AL\/browse/, () =>
      ++browses === 1 ? text('{"error":"ERROR_SERVICE_NOT_CONFIGURED"}', 400) : json({ fixed: 1 })
    );
    const r = await h.bridge.fetch({ operationId: 'browseAlbum', pathParams: { albumId: 'AL' } });
    expect(r).toEqual({ data: { fixed: 1 } });
    expect(browses).toBe(2);
    expect(h.fake.to(REGISTRATIONS)).toHaveLength(1);
  });

  it('does not self-heal when the caller named the service, and heals only once', async () => {
    const h = makeBridge();
    await startReady(h);
    h.fake.calls.length = 0;
    h.fake.on('GET', /albums/, () => text('ERROR_SERVICE_NOT_CONFIGURED', 400));
    const named = await h.bridge.fetch({ operationId: 'browseAlbum', pathParams: { ...SERVICE, albumId: 'AL' } });
    expect(named.error).toMatch(/^400/);
    expect(h.fake.to(REGISTRATIONS)).toHaveLength(0);
    const twice = await h.bridge.fetch({ operationId: 'browseAlbum', pathParams: { albumId: 'AL' } });
    expect(twice.error).toMatch(/^400/);
    expect(h.fake.to(REGISTRATIONS)).toHaveLength(1);
  });
});
