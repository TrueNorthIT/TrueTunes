// Run: npm run test:main
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gatewaySocketUrl,
  resolveSonosVia,
  sonosAuthHeaders,
  sonosImageRequest,
  speechStreamUrl,
  toGatewayUrl,
} from './sonos-transport.ts';

const BASE = 'https://truetunes.tnapps.co.uk';
const UA = 'Mozilla/test';

test('mode: defaults to gateway; config and env choose; env wins; junk falls back to gateway', () => {
  assert.equal(resolveSonosVia(undefined, undefined), 'gateway');
  assert.equal(resolveSonosVia('direct', undefined), 'direct');
  assert.equal(resolveSonosVia('gateway', undefined), 'gateway');
  assert.equal(resolveSonosVia('direct', 'gateway'), 'gateway');
  assert.equal(resolveSonosVia('gateway', 'direct'), 'direct');
  assert.equal(resolveSonosVia('gateway', 'bogus'), 'gateway'); // an invalid override is ignored
  assert.equal(resolveSonosVia('bogus', undefined), 'gateway');
  assert.equal(resolveSonosVia(42, ''), 'gateway');
});

test('URL mapping keeps path and query under /sonos', () => {
  assert.equal(toGatewayUrl(BASE, 'https://play.sonos.com/api/x?y=1'), `${BASE}/sonos/api/x?y=1`);
  assert.equal(
    toGatewayUrl(`${BASE}/`, 'https://play.sonos.com/api/content/v2/a%20b/browse'),
    `${BASE}/sonos/api/content/v2/a%20b/browse`
  );
  assert.equal(
    toGatewayUrl('http://localhost:7071', 'https://play.sonos.com/api/mfe'),
    'http://localhost:7071/sonos/api/mfe'
  );
});

test('only https play.sonos.com maps; anything else is null', () => {
  for (const url of [
    'http://play.sonos.com/api/x',
    'https://play.sonos.com.evil.com/x',
    'https://lh3.googleusercontent.com/abc',
    'https://play.sonos.com@evil.com/x',
    'not a url',
  ]) {
    assert.equal(toGatewayUrl(BASE, url), null, url);
  }
});

test('headers: direct sends the cookie, UA and Referer; gateway only the bearer', () => {
  const direct = { sessionToken: 'tok', userAgent: UA, referer: 'https://play.sonos.com/en-us/web-app' };
  assert.deepEqual(sonosAuthHeaders('direct', { bearer: 'id', direct }), {
    Cookie: '__Secure-next-auth.session-token=tok',
    Referer: 'https://play.sonos.com/en-us/web-app',
    'User-Agent': UA,
  });
  assert.deepEqual(sonosAuthHeaders('gateway', { bearer: 'id', direct }), { Authorization: 'Bearer id' });
  assert.deepEqual(sonosAuthHeaders('gateway', { bearer: null, direct }), {});
});

test('images: gateway sends Sonos URLs with the bearer and no cookie; other hosts get nothing', () => {
  const o = { gatewayBase: BASE, bearer: 'id', sessionToken: 'tok', userAgent: UA };
  assert.deepEqual(sonosImageRequest('gateway', 'https://play.sonos.com/api/img?id=1', { ...o, onSonosHost: true }), {
    url: `${BASE}/sonos/api/img?id=1`,
    headers: { Authorization: 'Bearer id' },
  });
  assert.deepEqual(sonosImageRequest('gateway', 'https://i.ytimg.com/a.jpg', { ...o, onSonosHost: false }), {
    url: 'https://i.ytimg.com/a.jpg',
    headers: { 'User-Agent': UA },
  });
  assert.equal(
    sonosImageRequest('gateway', 'https://play.sonos.com/x', { ...o, bearer: null, onSonosHost: true }),
    null
  );
});

test('images: direct is as it was, cookie only on the Sonos host', () => {
  const o = { gatewayBase: BASE, bearer: null, sessionToken: 'tok', userAgent: UA };
  assert.deepEqual(sonosImageRequest('direct', 'https://play.sonos.com/x', { ...o, onSonosHost: true }), {
    url: 'https://play.sonos.com/x',
    headers: { 'User-Agent': UA, Cookie: '__Secure-next-auth.session-token=tok' },
  });
  assert.deepEqual(sonosImageRequest('direct', 'https://i.ytimg.com/a.jpg', { ...o, onSonosHost: false }), {
    url: 'https://i.ytimg.com/a.jpg',
    headers: { 'User-Agent': UA },
  });
  assert.deepEqual(
    sonosImageRequest('direct', 'https://play.sonos.com/x', { ...o, sessionToken: null, onSonosHost: true })?.headers,
    { 'User-Agent': UA }
  );
});

test('socket URL', () => {
  assert.equal(gatewaySocketUrl(BASE), 'wss://truetunes.tnapps.co.uk/sonos/ws');
  assert.equal(gatewaySocketUrl('http://localhost:7071/'), 'ws://localhost:7071/sonos/ws');
});

// ── speech: the gateway's Azure Speech link, else the Google voice ───────────
// The gateway's contract is in server/src/shared/gatewayTts.test.ts; the web bridge's copy of this is tested in
// renderer/src/web/bridge/__tests__/sonosSocket.test.ts ('playAudioClip').

const MINTED = 'https://gw.test/tts/AbCdEfGhIjKlMnOpQrStUv.mp3';
const GOOGLE = (q: string) => `https://translate.google.com/translate_tts?ie=UTF-8&tl=en-GB&client=tw-ob&q=${q}`;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A fetch (standing in for fnFetch) that records its calls and answers with `respond`. */
function fakeFetch(respond: () => Response) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  return {
    calls,
    fetch: async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return respond();
    },
  };
}

test('speech: asks the gateway once, with { text } and a JSON body, and plays the link it mints', async () => {
  const f = fakeFetch(() => json({ url: MINTED }));
  const res = await speechStreamUrl({ text: 'Pizza is here', gatewayBase: 'https://gw.test/', fetch: f.fetch });
  assert.deepEqual(res, { streamUrl: MINTED });
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, 'https://gw.test/tts');
  assert.equal(f.calls[0].init.method, 'POST');
  assert.deepEqual(f.calls[0].init.headers, { 'Content-Type': 'application/json' });
  assert.deepEqual(JSON.parse(String(f.calls[0].init.body)), { text: 'Pizza is here' });
});

test('speech: a chosen voice goes to the gateway unchanged', async () => {
  const f = fakeFetch(() => json({ url: MINTED }));
  await speechStreamUrl({ text: 'Hi', voice: 'en-GB-RyanNeural', gatewayBase: 'https://gw.test', fetch: f.fetch });
  assert.deepEqual(JSON.parse(String(f.calls[0].init.body)), { text: 'Hi', voice: 'en-GB-RyanNeural' });
});

test('speech: a gateway 400 comes back as its { error }, never a URL', async () => {
  for (const error of ['Invalid voice', 'Invalid text']) {
    const f = fakeFetch(() => json({ error }, 400));
    assert.deepEqual(await speechStreamUrl({ text: 'Hi', gatewayBase: 'https://gw.test', fetch: f.fetch }), { error });
  }
  const bare = fakeFetch(() => new Response('bad', { status: 400 }));
  assert.deepEqual(await speechStreamUrl({ text: 'Hi', gatewayBase: 'https://gw.test', fetch: bare.fetch }), {
    error: 'Invalid announcement',
  });
});

test('speech: any other failure is the exact Google Translate URL, after one try of the gateway', async () => {
  for (const [what, respond] of [
    ['a 503 speech-unavailable', () => json({ error: 'speech-unavailable' }, 503)],
    ['a 429', () => json({ error: 'quota' }, 429)],
    ['a 500', () => new Response('boom', { status: 500 })],
    ['a 401', () => json({ error: 'sign-in required' }, 401)],
    ['a 200 that is not JSON', () => new Response('<html>oops</html>')],
    ['a 200 with no url', () => json({})],
    ['a 200 whose url is not https', () => json({ url: 'http://gw.test/tts/x.mp3' })],
    [
      'a network error',
      (): Response => {
        throw new TypeError('fetch failed');
      },
    ],
  ] as Array<[string, () => Response]>) {
    const f = fakeFetch(respond);
    const res = await speechStreamUrl({
      text: 'Pizza & chips',
      voice: 'en-GB-RyanNeural',
      gatewayBase: 'https://gw.test',
      fetch: f.fetch,
    });
    assert.deepEqual(res, { streamUrl: GOOGLE('Pizza%20%26%20chips') }, what);
    assert.equal(f.calls.length, 1, what);
  }
});
