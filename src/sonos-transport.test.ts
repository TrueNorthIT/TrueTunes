// Run: npm run test:main
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gatewaySocketUrl,
  resolveSonosVia,
  sonosAuthHeaders,
  sonosImageRequest,
  toGatewayUrl,
} from './sonos-transport.ts';

const BASE = 'https://truetunes.tnapps.co.uk';
const UA = 'Mozilla/test';

test('mode: defaults to direct; config and env choose; env wins; junk falls back to direct', () => {
  assert.equal(resolveSonosVia(undefined, undefined), 'direct');
  assert.equal(resolveSonosVia('gateway', undefined), 'gateway');
  assert.equal(resolveSonosVia('direct', 'gateway'), 'gateway');
  assert.equal(resolveSonosVia('gateway', 'direct'), 'direct');
  assert.equal(resolveSonosVia('gateway', 'bogus'), 'gateway'); // an invalid override is ignored
  assert.equal(resolveSonosVia('bogus', undefined), 'direct');
  assert.equal(resolveSonosVia(42, ''), 'direct');
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
