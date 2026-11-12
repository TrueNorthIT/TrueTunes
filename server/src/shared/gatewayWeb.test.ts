// Run: npm test (from server/).
//
// The web-app half of the gateway (server/src/shared/gatewayWeb.ts, reached through createGatewayHandler):
// what a browser needs so that the True Tunes web app lives on one origin.
//
// Contract:
//   ANY /fn/<rest>    -> https://truetunes-fn.azurewebsites.net/api/<rest>, query kept. Needs a valid
//                        `Authorization: Bearer <Entra ID token>`, which is forwarded untouched; the gateway adds
//                        no credential of its own and never looks up the Sonos session. /fn/sonos-session is 404.
//   GET /img?url=<u>  -> the image at <u>, only for https URLs on IMAGE_HOSTS. The host is checked before the
//                        token (so a refusal can be shown without signing in); a listed host needs a token.
//                        No client header is forwarded, redirects are not followed, only image/* comes back.
//   GET <anything>    -> the web app's static files when a `staticFile` lookup is given: `/` and extension-less
//                        paths are index.html; /sonos, /fn, /img and /healthz never fall through to it.
//
// Requirements covered here (the IDs are in the test names):
//   WEB-1  /fn needs a valid sign-in; the caller's Authorization goes through untouched; nothing is added.
//   WEB-2  /fn cannot reach any host or path but the Function App's /api/, and never /api/sonos-session.
//   WEB-3  /img serves listed hosts only, to signed-in callers only, and is not an open proxy.
//   WEB-4  Static files: the app shell, SPA fallback, cache headers, and no fall-through from reserved paths.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGatewayHandler } from './gatewayHttp';
import { FUNCTIONS_ORIGIN, IMAGE_HOSTS, type StaticFile } from './gatewayWeb';
import {
  GOOD_AUTH,
  bodyBytes,
  bodyJson,
  bodyText,
  createStubSession,
  gatewayRequest,
  header,
  headerNames,
  reply,
  stubVerify,
} from './gatewayKit.testkit';

interface Call {
  method: string;
  url: URL;
  headers: Headers;
  body: Buffer;
  redirect: string | undefined;
}

type Responder = (call: Call) => Response | Promise<Response>;

/** A gateway whose `fetch` records every call and answers with `responder`. */
function rig(opts: { responder?: Responder; staticFile?: (path: string) => StaticFile | null } = {}) {
  const calls: Call[] = [];
  const logs: string[] = [];
  const stub = createStubSession();
  const responder: Responder =
    opts.responder ?? (() => reply(200, JSON.stringify({ ok: true }), { 'content-type': 'application/json' }));
  const fetchFake = (async (input: Parameters<typeof fetch>[0], init: RequestInit = {}) => {
    const call: Call = {
      method: (init.method ?? 'GET').toUpperCase(),
      url: new URL(String(input)),
      headers: new Headers(init.headers),
      body:
        init.body == null
          ? Buffer.alloc(0)
          : Buffer.from(await new Response(init.body as ConstructorParameters<typeof Response>[0]).arrayBuffer()),
      redirect: init.redirect,
    };
    calls.push(call);
    return responder(call);
  }) as typeof fetch;
  const handler = createGatewayHandler({
    session: stub.session,
    fetch: fetchFake,
    verify: stubVerify().verify,
    log: (msg) => void logs.push(msg),
    ...(opts.staticFile ? { staticFile: opts.staticFile } : {}),
  });
  return {
    calls,
    logs,
    stub,
    send: (url: string, init?: Parameters<typeof gatewayRequest>[1]) => handler(gatewayRequest(url, init)),
  };
}

const only = (calls: Call[]): Call => {
  assert.equal(calls.length, 1, `Expected exactly one upstream call, got ${calls.map((c) => c.url.href).join(', ')}`);
  return calls[0] as Call;
};

// ── WEB-1: /fn is a signed-in pass-through to the Function App ────────────────

test('WEB-1: /fn without an Authorization header gets 401 and nothing is fetched', async () => {
  const r = rig();
  const res = await r.send('/fn/stats?period=week', { auth: null });
  assert.equal(res.status, 401);
  assert.equal(r.calls.length, 0);
});

test('WEB-1: /fn with a token that does not verify gets 401 and nothing is fetched', async () => {
  const r = rig();
  const res = await r.send('/fn/stats', { auth: 'Bearer forged' });
  assert.equal(res.status, 401);
  assert.equal(r.calls.length, 0);
});

test('WEB-1: GET /fn/<path>?<query> reaches the Function App under /api/ with the query string', async () => {
  const r = rig();
  const res = await r.send('/fn/stats?period=week&userId=Alex%20B');
  assert.equal(res.status, 200);
  const call = only(r.calls);
  assert.equal(call.method, 'GET');
  assert.equal(call.url.href, `${FUNCTIONS_ORIGIN}/api/stats?period=week&userId=Alex%20B`);
  assert.equal(call.redirect, 'manual', 'A redirect is the client’s to see, not the gateway’s to follow');
});

test('WEB-1: the caller’s Authorization header is forwarded untouched and no credential is added', async () => {
  const r = rig();
  await r.send('/fn/playlists', {
    method: 'POST',
    body: '{"name":"x"}',
    headers: { 'content-type': 'application/json' },
  });
  const call = only(r.calls);
  assert.equal(call.headers.get('authorization'), GOOD_AUTH);
  assert.equal(call.headers.get('cookie'), null, 'The gateway must not add a cookie to a Functions call');
  assert.equal(call.headers.get('x-functions-key'), null);
  assert.equal(r.stub.calls.length, 0, 'A Functions call must never look up the Sonos session');
});

test('WEB-1: a JSON body and its Content-Type reach the function, and its status and body come back', async () => {
  const r = rig({
    responder: () => reply(201, '{"id":"p1"}', { 'content-type': 'application/json', 'set-cookie': 'a=b' }),
  });
  const res = await r.send('/fn/playlists', {
    method: 'POST',
    body: '{"name":"Friday"}',
    headers: { 'content-type': 'application/json' },
  });
  const call = only(r.calls);
  assert.equal(call.method, 'POST');
  assert.equal(call.body.toString(), '{"name":"Friday"}');
  assert.equal(call.headers.get('content-type'), 'application/json');
  assert.equal(res.status, 201);
  assert.deepEqual(bodyJson(res), { id: 'p1' });
  assert.ok(!headerNames(res).includes('set-cookie'), 'Set-Cookie is never passed to the client');
  assert.equal(header(res, 'x-content-type-options'), 'nosniff');
  assert.match(header(res, 'content-security-policy') ?? '', /sandbox/, 'A function’s answer must never run as a page');
});

test('WEB-1: a binary body (an image upload) reaches the function byte for byte', async () => {
  const r = rig();
  const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 255, 1, 2]);
  await r.send('/fn/profile/Alex/image', { method: 'POST', body: bytes, headers: { 'content-type': 'image/png' } });
  assert.deepEqual([...only(r.calls).body], [...bytes]);
});

test('WEB-1: the client’s Cookie, Host, Origin, Referer and forwarding headers are not sent to the function', async () => {
  const r = rig();
  await r.send('/fn/users', {
    headers: {
      cookie: 'sid=1',
      origin: 'https://truetunes.tnapps.co.uk',
      referer: 'https://truetunes.tnapps.co.uk/',
      'x-forwarded-for': '10.0.0.1',
      'x-forwarded-host': 'evil.example',
    },
  });
  const call = only(r.calls);
  for (const name of ['cookie', 'origin', 'referer', 'x-forwarded-for', 'x-forwarded-host'])
    assert.equal(call.headers.get(name), null, `${name} must not be forwarded`);
  assert.notEqual(call.headers.get('host'), 'gateway.example');
});

test('WEB-1: a function’s 4xx and 5xx come back as they are', async () => {
  for (const status of [400, 404, 409, 500]) {
    const r = rig({ responder: () => reply(status, '{"error":"x"}', { 'content-type': 'application/json' }) });
    const res = await r.send('/fn/score', { method: 'POST', body: '{}' });
    assert.equal(res.status, status);
    assert.deepEqual(bodyJson(res), { error: 'x' });
  }
});

test('WEB-1: when the Function App cannot be reached the caller gets 502 functions-unreachable, with no detail', async () => {
  const r = rig({
    responder: () => {
      throw new TypeError(`fetch failed: Authorization: ${GOOD_AUTH}`);
    },
  });
  const res = await r.send('/fn/stats');
  assert.equal(res.status, 502);
  assert.deepEqual(bodyJson(res), { error: 'functions-unreachable' });
  assert.ok(!r.logs.join('\n').includes('entra-token'), 'The token must not be logged');
});

// ── WEB-2: /fn cannot leave the Function App's /api/, and never reaches sonos-session ──

for (const url of [
  '/fn/sonos-session',
  '/fn/sonos-session/',
  '/fn/Sonos-Session',
  '/fn/sonos%2Dsession',
  '/fn/%73onos-session',
  '/fn//sonos-session',
  '/fn/x/../sonos-session',
  '/fn/sonos-session?x=1',
  '/fn/%2573onos-session',
  '/fn/sonos%252Dsession',
]) {
  test(`WEB-2: ${url} is 404 and nothing is fetched (the Sonos session is not for browsers)`, async () => {
    const r = rig();
    const res = await r.send(url);
    assert.equal(res.status, 404);
    assert.equal(r.calls.length, 0);
  });
}

for (const url of ['/fn', '/fn/', '/fnx/stats']) {
  test(`WEB-2: ${url} is 404 and nothing is fetched`, async () => {
    const r = rig();
    const res = await r.send(url);
    assert.equal(res.status, 404);
    assert.equal(r.calls.length, 0);
  });
}

for (const url of [
  '/fn/../admin',
  '/fn/%2e%2e/admin',
  '/fn/..%2fadmin',
  '/fn//evil.example/x',
  '/fn/https://evil.example/x',
  '/fn/\\\\evil.example\\x',
  '/fn/@evil.example/x',
  '/fn/stats?url=https://evil.example/',
]) {
  test(`WEB-2: ${url} never reaches any host or path but the Function App’s /api/`, async () => {
    const r = rig();
    const res = await r.send(url, { headers: { host: 'evil.example', 'x-forwarded-host': 'evil.example' } });
    assert.ok(res.status < 500, `Expected a considered answer, got ${res.status}`);
    for (const call of r.calls) {
      assert.equal(call.url.origin, FUNCTIONS_ORIGIN, `A request went to ${call.url.href}`);
      assert.ok(call.url.pathname.startsWith('/api/'), `A request went to ${call.url.href}`);
      assert.ok(!call.url.pathname.split('/').includes('..'), `A ".." segment went upstream: ${call.url.href}`);
    }
  });
}

// ── WEB-3: /img serves listed hosts only ──────────────────────────────────────

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const imageUpstream: Responder = () => reply(200, PNG, { 'content-type': 'image/png', 'set-cookie': 'a=b' });
const img = (url: string) => `/img?url=${encodeURIComponent(url)}`;

test('WEB-3: www.gstatic.com is on the list', () => {
  assert.ok(IMAGE_HOSTS.includes('www.gstatic.com'));
});

test('WEB-3: an image on a listed host comes back byte for byte with its type, for a signed-in caller', async () => {
  const r = rig({ responder: imageUpstream });
  const res = await r.send(img('https://www.gstatic.com/images/branding/a.png?x=1'));
  assert.equal(res.status, 200);
  assert.deepEqual([...bodyBytes(res)], [...PNG]);
  assert.equal(header(res, 'content-type'), 'image/png');
  assert.match(header(res, 'cache-control') ?? '', /^private, max-age=\d+$/);
  assert.ok(!headerNames(res).includes('set-cookie'));
  const call = only(r.calls);
  assert.equal(call.url.href, 'https://www.gstatic.com/images/branding/a.png?x=1');
  assert.equal(call.method, 'GET');
  assert.equal(call.redirect, 'manual');
});

test('WEB-3: none of the caller’s headers reach the image host, least of all the token', async () => {
  const r = rig({ responder: imageUpstream });
  await r.send(img('https://www.gstatic.com/a.png'), { headers: { cookie: 'sid=1', 'x-custom': 'y' } });
  const call = only(r.calls);
  for (const name of ['authorization', 'cookie', 'x-custom', 'user-agent', 'referer', 'origin'])
    assert.equal(call.headers.get(name), null, `${name} must not be sent to the image host`);
  assert.equal(r.stub.calls.length, 0, 'An image call must never look up the Sonos session');
});

test('WEB-3: a listed host without a sign-in gets 401 and nothing is fetched', async () => {
  const r = rig({ responder: imageUpstream });
  const res = await r.send(img('https://www.gstatic.com/a.png'), { auth: null });
  assert.equal(res.status, 401);
  assert.equal(r.calls.length, 0);
});

for (const [why, url] of [
  ['a host that is not on the list', 'https://evil.example/a.png'],
  ['a host that only ends like a listed one', 'https://evilwww.gstatic.com/a.png'],
  ['a listed host as a subdomain of another', 'https://www.gstatic.com.evil.example/a.png'],
  ['plain http', 'http://www.gstatic.com/a.png'],
  ['another port', 'https://www.gstatic.com:8443/a.png'],
  ['credentials in the URL', 'https://user:pass@www.gstatic.com/a.png'],
  ['a listed host after an @', 'https://www.gstatic.com@evil.example/a.png'],
  ['our own gateway', 'https://truetunes.tnapps.co.uk/healthz'],
  ['a local address', 'https://127.0.0.1/a.png'],
  ['the metadata address', 'http://169.254.169.254/latest/meta-data'],
  ['a file URL', 'file:///etc/passwd'],
] as const) {
  test(`WEB-3: ${why} (${url}) is refused with 403, signed in or not, and nothing is fetched`, async () => {
    for (const auth of [undefined, null] as const) {
      const r = rig({ responder: imageUpstream });
      const res = await r.send(img(url), auth === null ? { auth: null } : {});
      assert.equal(res.status, 403, `Expected 403 for ${url}`);
      assert.equal(r.calls.length, 0);
    }
  });
}

for (const url of ['/img', '/img?url=', '/img?url=not-a-url', '/img?other=https://www.gstatic.com/a.png']) {
  test(`WEB-3: ${url} is 400 and nothing is fetched`, async () => {
    const r = rig({ responder: imageUpstream });
    const res = await r.send(url);
    assert.equal(res.status, 400);
    assert.equal(r.calls.length, 0);
  });
}

test('WEB-3: only GET is served', async () => {
  const r = rig({ responder: imageUpstream });
  const res = await r.send(img('https://www.gstatic.com/a.png'), { method: 'POST', body: 'x' });
  assert.equal(res.status, 405);
  assert.equal(r.calls.length, 0);
});

test('WEB-3: a redirect from the image host is not followed and not passed on', async () => {
  const r = rig({ responder: () => reply(302, null, { location: 'https://evil.example/a.png' }) });
  const res = await r.send(img('https://www.gstatic.com/a.png'));
  assert.equal(res.status, 502);
  assert.equal(r.calls.length, 1, 'The redirect must not be followed');
  assert.ok(!headerNames(res).includes('location'));
});

test('WEB-3: a response that is not an image is not passed on', async () => {
  const r = rig({ responder: () => reply(200, '<html>hi</html>', { 'content-type': 'text/html' }) });
  const res = await r.send(img('https://www.gstatic.com/a.png'));
  assert.equal(res.status, 502);
  assert.ok(!bodyText(res).includes('<html>'));
});

test('WEB-3: an image host’s 404 is a 404 here, without its body', async () => {
  const r = rig({ responder: () => reply(404, 'gone', { 'content-type': 'text/plain' }) });
  const res = await r.send(img('https://www.gstatic.com/a.png'));
  assert.equal(res.status, 404);
  assert.ok(!bodyText(res).includes('gone'));
});

test('WEB-3: an unreachable image host is a 502', async () => {
  const r = rig({
    responder: () => {
      throw new TypeError('fetch failed');
    },
  });
  const res = await r.send(img('https://www.gstatic.com/a.png'));
  assert.equal(res.status, 502);
});

// ── WEB-4: static files ───────────────────────────────────────────────────────

const text = (s: string, type: string): StaticFile => ({ body: Buffer.from(s), type });
const FILES: Record<string, StaticFile> = {
  '/index.html': text('<!doctype html><title>True Tunes</title>', 'text/html; charset=utf-8'),
  '/sw.js': text('// sw', 'text/javascript; charset=utf-8'),
  '/manifest.webmanifest': text('{}', 'application/manifest+json'),
  '/assets/index-abc123.js': { ...text('console.log(1)', 'text/javascript; charset=utf-8'), br: Buffer.from('BR') },
  '/icons/icon-192.png': { body: PNG, type: 'image/png' },
};
const staticFile = (path: string) => FILES[path] ?? null;
const web = () => rig({ staticFile });

test('WEB-4: GET / is the app shell, served no-cache, with no sign-in', async () => {
  const res = await web().send('/', { auth: null });
  assert.equal(res.status, 200);
  assert.match(bodyText(res), /True Tunes/);
  assert.match(header(res, 'content-type') ?? '', /^text\/html/);
  assert.equal(header(res, 'cache-control'), 'no-cache');
  assert.equal(header(res, 'x-content-type-options'), 'nosniff');
  assert.match(header(res, 'content-security-policy') ?? '', /frame-ancestors 'none'/);
});

for (const path of ['/sw.js', '/manifest.webmanifest', '/index.html']) {
  test(`WEB-4: ${path} is served no-cache`, async () => {
    const res = await web().send(path, { auth: null });
    assert.equal(res.status, 200);
    assert.equal(header(res, 'cache-control'), 'no-cache');
  });
}

test('WEB-4: a hashed file under /assets/ is cached for a year, immutable', async () => {
  const res = await web().send('/assets/index-abc123.js', { auth: null });
  assert.equal(res.status, 200);
  assert.equal(header(res, 'cache-control'), 'public, max-age=31536000, immutable');
  assert.equal(bodyText(res), 'console.log(1)');
});

test('WEB-4: a client that accepts brotli gets the compressed copy, and caches are told it varies', async () => {
  const res = await web().send('/assets/index-abc123.js', { auth: null, headers: { 'accept-encoding': 'gzip, br' } });
  assert.equal(header(res, 'content-encoding'), 'br');
  assert.equal(bodyText(res), 'BR');
  assert.match(header(res, 'vary') ?? '', /accept-encoding/i);
  const plain = await web().send('/icons/icon-192.png', { auth: null, headers: { 'accept-encoding': 'gzip, br' } });
  assert.equal(header(plain, 'content-encoding'), undefined);
});

test('WEB-4: other files get a short cache', async () => {
  const res = await web().send('/icons/icon-192.png', { auth: null });
  assert.equal(res.status, 200);
  assert.equal(header(res, 'cache-control'), 'public, max-age=3600');
  assert.deepEqual([...bodyBytes(res)], [...PNG]);
});

for (const path of ['/demo', '/demo/', '/auth/redirect', '/anything/else', '/auth/redirect?code=abc']) {
  test(`WEB-4: ${path} (no file, no extension) is the app shell, no-cache`, async () => {
    const res = await web().send(path, { auth: null });
    assert.equal(res.status, 200);
    assert.match(bodyText(res), /True Tunes/);
    assert.equal(header(res, 'cache-control'), 'no-cache');
  });
}

for (const path of ['/assets/missing-000.js', '/favicon.ico', '/nope.html', '/.env', '/assets/../secret.txt']) {
  test(`WEB-4: ${path} (a missing file) is 404, not the app shell`, async () => {
    const res = await web().send(path, { auth: null });
    assert.equal(res.status, 404);
    assert.ok(!bodyText(res).includes('True Tunes'));
  });
}

for (const path of [
  '/sonos',
  '/sonos/',
  '/sonos/nope',
  '/sonos/ws',
  '/fn',
  '/img/x',
  '/healthz/extra',
  '/sonos/api/auth/session',
]) {
  test(`WEB-4: ${path} never falls through to the app shell`, async () => {
    const res = await web().send(path);
    assert.notEqual(res.status, 200);
    assert.ok(!bodyText(res).includes('True Tunes'));
  });
}

for (const path of ['/pubsub', '/pubsub/', '/pubsub/ws', '/pubsub/ws?username=A', '/pubsub/nope']) {
  test(`WEB-4: ${path} over plain HTTP is a 404, never the app shell`, async () => {
    for (const auth of [undefined, null]) {
      const res = await web().send(path, auth === null ? { auth: null } : {});
      assert.equal(res.status, 404);
      assert.ok(!bodyText(res).includes('True Tunes'));
    }
  });
}

test('WEB-4: only GET and HEAD reach the static files', async () => {
  const res = await web().send('/', { method: 'POST', body: 'x', auth: null });
  assert.equal(res.status, 404);
  const head = await web().send('/', { method: 'HEAD', auth: null });
  assert.equal(head.status, 200);
  assert.equal(bodyBytes(head).length, 0);
});

test('WEB-4: with no static files configured, / is 404 as before', async () => {
  const res = await rig().send('/', { auth: null });
  assert.equal(res.status, 404);
});

test('WEB-4: /healthz still answers with static files configured', async () => {
  const res = await web().send('/healthz', { auth: null });
  assert.equal(res.status, 200);
  assert.deepEqual(bodyJson(res), { ok: true });
});
