// Run: npm test (from server/).
//
// createGatewayHandler in server/src/shared/gatewayHttp.ts: the HTTP half of the Sonos gateway, the
// always-on service that fronts all Sonos traffic for the True Tunes desktop app. The WebSocket half
// is tested in gatewayRelay.test.ts.
//
// Contract (frozen):
//   ANY /sonos/<rest>  -> https://play.sonos.com/<rest>, only when <rest> begins with "api/"; the query
//                         string is kept. Needs `Authorization: Bearer <Entra ID token>`, always.
//   GET /healthz       -> 200 { ok: true }, no auth, no Sonos call.
//   anything else      -> 404.
//
// The handler is a plain function over plain objects, built with injected dependencies:
//   createGatewayHandler({ session, fetch, verify, log? })(req) -> { status, headers, body }
//   session  { get({ refresh? }) } : the shared Sonos session (the real createSonosSession, or a stub)
//   fetch    : how it reaches Sonos (here: the fake play.sonos.com in gatewayKit.testkit.ts)
//   verify   : (Authorization header | undefined) -> { oid } | null
// so nothing here touches Azure, Okta, Entra or Sonos.
//
// Requirements covered here (the IDs are in the test names):
//   GW-1  A request without a valid work sign-in gets 401 and nothing reaches Sonos.
//   GW-2  A signed-in caller's /sonos/api/... request reaches Sonos with the server's session and
//         comes back unchanged (status, body bytes, ordinary headers).
//   GW-3  The client can never choose the upstream host or smuggle its own cookie, and never
//         receives Set-Cookie.
//   GW-4  A Sonos 401 is healed by one session refresh and one retry; a failed Sonos login is a
//         502 that names the cause; the session token and password never appear in responses or logs.
//   GW-7  /healthz answers 200 without auth and without calling Sonos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGatewayHandler } from './gatewayHttp';
import { createSonosSession } from './sonosSession';
import { tenantKeys } from './authKit.testkit';
import { SONOS_PASSWORD, SONOS_USERNAME, createFakeSonos } from './sonosKit.testkit';
import {
  BROWSER_UA,
  GOOD_TOKEN,
  PLAY_ORIGIN,
  SESSION_COOKIE,
  bearerVerifier,
  bodyBytes,
  bodyJson,
  bodyText,
  createFakeUpstream,
  createStubSession,
  gatewayRequest,
  header,
  headerNames,
  loginError,
  reply,
  stubVerify,
  type FakeUpstream,
  type GatewayRequest,
  type StubSession,
  type VerifyStub,
} from './gatewayKit.testkit';

type Handler = ReturnType<typeof createGatewayHandler>;
type Deps = Parameters<typeof createGatewayHandler>[0];

/** A gateway over a stub session and a fake play.sonos.com that accepts the stub's tokens. */
function rig(
  opts: {
    session?: StubSession;
    verify?: VerifyStub['verify'];
    /** Session tokens the fake Sonos accepts. Default: both the stub's first and refreshed token. */
    accept?: string[];
    /** Replaces how the gateway reaches Sonos; given the fake play.sonos.com to build on. */
    fetch?: (upstream: FakeUpstream) => typeof fetch;
  } = {}
) {
  const upstream = createFakeUpstream();
  for (const token of opts.accept ?? ['sess-old', 'sess-new']) upstream.accept(token);
  const stub = opts.session ?? createStubSession('sess-old', 'sess-new');
  const verifyStub = stubVerify();
  const logs: string[] = [];
  const deps: Deps = {
    session: stub.session,
    fetch: opts.fetch ? opts.fetch(upstream) : upstream.fetch,
    verify: opts.verify ?? verifyStub.verify,
    log: (msg) => void logs.push(msg),
  };
  const handler: Handler = createGatewayHandler(deps);
  return {
    handler,
    upstream,
    stub,
    verifyStub,
    logs,
    send: (url: string, init?: Parameters<typeof gatewayRequest>[1]) => handler(gatewayRequest(url, init)),
  };
}

/** A gateway over the REAL session logic and the fake Sonos login behind the fake play.sonos.com. */
function realRig() {
  const sonos = createFakeSonos();
  const upstream = createFakeUpstream(sonos);
  const session = createSonosSession({ fetch: upstream.fetch, username: SONOS_USERNAME, password: SONOS_PASSWORD });
  const logs: string[] = [];
  const handler = createGatewayHandler({
    session,
    fetch: upstream.fetch,
    verify: stubVerify().verify,
    log: (msg) => void logs.push(msg),
  });
  return {
    sonos,
    upstream,
    handler,
    logs,
    send: (url: string, init?: Parameters<typeof gatewayRequest>[1]) => handler(gatewayRequest(url, init)),
  };
}

const GROUPS = '/sonos/api/groups/v1/households/Sonos_abc/groups';
const jsonType = /application\/json/;

function assertNothingReachedSonos(r: { upstream: FakeUpstream; stub: StubSession }, why: string): void {
  assert.equal(
    r.upstream.calls.length,
    0,
    `Expected no request to Sonos ${why}, got ${r.upstream.calls.map((c) => `${c.method} ${c.url.href}`).join(', ')}`
  );
  assert.equal(r.stub.calls.length, 0, `Expected no Sonos session lookup (and so no Sonos login) ${why}`);
  assert.equal(r.upstream.sonos.requests.length, 0, `Expected no Sonos login traffic ${why}`);
}

/** The single request the gateway made to Sonos; fails the test when there was not exactly one. */
function onlyCall(upstream: FakeUpstream) {
  assert.equal(
    upstream.calls.length,
    1,
    `Expected exactly one request to Sonos, got ${upstream.calls.map((c) => `${c.method} ${c.url.href}`).join(', ') || 'none'}`
  );
  return upstream.calls[0];
}

// ── GW-1: no valid work sign-in, nothing reaches Sonos ────────────────────────

for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
  // Given a request with no Authorization header, the handler answers 401 { error } and does not
  // ask the session for a token (so no Sonos login) or call Sonos.
  test(`GW-1: ${method} /sonos/api/... with no Authorization header gets 401 and nothing reaches Sonos`, async () => {
    const r = rig();
    const res = await r.send(GROUPS, { method, auth: null, body: method === 'GET' ? undefined : '{"x":1}' });
    assert.equal(res.status, 401, 'Expected 401 for a request with no work sign-in');
    assert.match(header(res, 'content-type') ?? '', jsonType, 'Expected the 401 to be JSON');
    assert.equal(
      typeof (bodyJson(res) as { error?: unknown }).error,
      'string',
      'Expected a JSON body { error } explaining the refusal'
    );
    assertNothingReachedSonos(r, 'for an unauthenticated request');
  });
}

// Given a token verify rejects, the handler answers 401, and verify was asked about the header exactly as sent.
test('GW-1: an Authorization header that verify rejects gets 401 and nothing reaches Sonos', async () => {
  const r = rig();
  const res = await r.send(GROUPS, { auth: 'Bearer not-a-colleague' });
  assert.equal(res.status, 401, 'Expected 401 for an invalid token');
  assert.deepEqual(
    r.verifyStub.calls,
    ['Bearer not-a-colleague'],
    'Expected verify to be given the Authorization header value as sent'
  );
  assertNothingReachedSonos(r, 'for an invalid token');
});

test('GW-1: a refused request cannot force a Sonos re-login', async () => {
  const r = rig();
  const res = await r.send(`${GROUPS}?refresh=1`, { auth: 'Basic dXNlcjpwYXNz' });
  assert.equal(res.status, 401, 'Expected 401 for a Basic Authorization header');
  assertNothingReachedSonos(r, 'so an anonymous caller cannot force a re-login');
});

// If checking the token itself breaks (the Entra keys cannot be fetched), the request is refused, never let through.
test('GW-1: when verify throws, the request is refused and nothing reaches Sonos', async () => {
  const r = rig({
    verify: async () => {
      throw new Error('JWKS fetch failed');
    },
  });
  const res = await r.send(GROUPS).catch(() => null);
  assert.ok(
    res === null || res.status >= 400,
    `Expected a refusal (or an error the entry point turns into one), got ${res?.status}`
  );
  assertNothingReachedSonos(r, 'when the token could not be checked');
});

// Through the REAL Entra check (signature, issuer, audience, expiry): only a genuine tenant token gets in.
test('GW-1: tokens that are forged, expired, from another tenant or not Bearer get 401; a genuine one is served', async () => {
  const { check, sign, rogue } = await tenantKeys();
  const r = rig({ verify: bearerVerifier(check) });
  const twoHoursAgo = Math.floor(Date.now() / 1000) - 2 * 3600;
  const bad: Record<string, string> = {
    'a token signed by a key that is not the tenant’s': `Bearer ${await sign(undefined, { key: rogue })}`,
    'an expired token': `Bearer ${await sign(undefined, { exp: twoHoursAgo })}`,
    'a token from another tenant': `Bearer ${await sign(undefined, { iss: 'https://login.microsoftonline.com/99999999-0000-0000-0000-000000000000/v2.0' })}`,
    'a Basic header': 'Basic dXNlcjpwYXNz',
  };
  for (const [what, auth] of Object.entries(bad)) {
    const res = await r.send(GROUPS, { auth });
    assert.equal(res.status, 401, `Expected 401 for ${what}`);
  }
  assertNothingReachedSonos(r, 'for any of the refused tokens');

  const ok = await r.send(GROUPS, { auth: `Bearer ${await sign()}` });
  assert.equal(ok.status, 200, 'Expected a genuine tenant token to be served');
  assert.equal(r.upstream.calls.length, 1, 'Expected the genuine request to reach Sonos');
});

// ── GW-2: a signed-in caller's request reaches Sonos and comes back unchanged ─

test('GW-2: GET /sonos/api/... is sent to https://play.sonos.com/api/... with the query string and the server’s session', async () => {
  const r = rig();
  const res = await r.send(`${GROUPS}?muse2=true&a=1&a=2&q=two%20words%26more`);
  assert.equal(res.status, 200, 'Expected Sonos’s 200 to come back');
  const call = onlyCall(r.upstream);
  assert.equal(call.method, 'GET', 'Expected the method to pass through');
  assert.equal(
    call.url.href,
    `${PLAY_ORIGIN}/api/groups/v1/households/Sonos_abc/groups?muse2=true&a=1&a=2&q=two%20words%26more`,
    'Expected the /sonos prefix removed, the rest of the path and the query string kept exactly'
  );
  assert.equal(
    call.headers.get('cookie'),
    `${SESSION_COOKIE}=sess-old`,
    'Expected Cookie to be exactly the session cookie holding the shared session'
  );
  assert.equal(r.stub.calls.length, 1, 'Expected one session lookup');
  assert.ok(!r.stub.calls[0].refresh, 'Expected a plain (cached) session lookup, not a refresh');
});

test('GW-2: Sonos is sent the spoofed browser User-Agent and the web-app Referer, not the client’s', async () => {
  const r = rig();
  await r.send(GROUPS, { headers: { 'user-agent': 'TrueTunes/1.0.94 Electron/40', referer: 'https://app.example/x' } });
  const call = onlyCall(r.upstream);
  const ua = call.headers.get('user-agent') ?? '';
  assert.match(ua, BROWSER_UA, `Expected a browser User-Agent, got "${ua}"`);
  assert.ok(!ua.includes('TrueTunes'), 'Expected the client’s own User-Agent to be replaced, not sent on');
  assert.equal(call.headers.get('referer'), `${PLAY_ORIGIN}/en-us/web-app`, 'Expected Referer to be the Sonos web app');
});

test('GW-2: the response status, body bytes and ordinary headers come back unchanged', async () => {
  const r = rig();
  const upstreamBody = JSON.stringify({ groups: [{ id: 'RINCON_1:7', name: 'Office' }] });
  r.upstream.responder = () =>
    reply(200, upstreamBody, {
      'content-type': 'application/json; charset=utf-8',
      etag: '"abc123"',
      'cache-control': 'private, max-age=5',
      'x-sonos-correlation': 'corr-42',
    });
  const res = await r.send(GROUPS);
  assert.equal(res.status, 200, 'Expected Sonos’s status');
  assert.equal(bodyText(res), upstreamBody, 'Expected Sonos’s body byte for byte');
  assert.equal(header(res, 'content-type'), 'application/json; charset=utf-8', 'Expected Content-Type to pass through');
  assert.equal(header(res, 'etag'), '"abc123"', 'Expected ETag to pass through (queue edits depend on it)');
  assert.equal(header(res, 'cache-control'), 'private, max-age=5', 'Expected Cache-Control to pass through');
  assert.equal(header(res, 'x-sonos-correlation'), 'corr-42', 'Expected other ordinary headers to pass through');
});

test('GW-2: a POST with a JSON body reaches Sonos with the same body, and Sonos’s 201 comes back', async () => {
  const r = rig();
  const body = JSON.stringify({ items: [{ uri: 'x-sonos-spotify:track:1', position: 3 }], note: 'café \u{1f3b5}' });
  r.upstream.responder = () => reply(201, '{"created":true}', { 'content-type': 'application/json', etag: '"q2"' });
  const res = await r.send('/sonos/api/content/v1/groups/G/services/16751367/accounts/123209393/queues/Q/resources', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
  const call = onlyCall(r.upstream);
  assert.equal(call.method, 'POST', 'Expected the method to pass through');
  assert.equal(call.body.toString('utf8'), body, 'Expected the request body to reach Sonos byte for byte');
  assert.equal(call.headers.get('content-type'), 'application/json', 'Expected Content-Type to pass through');
  assert.equal(res.status, 201, 'Expected Sonos’s 201');
  assert.equal(header(res, 'etag'), '"q2"', 'Expected the new ETag back');
});

for (const method of ['PATCH', 'DELETE', 'PUT']) {
  test(`GW-2: a ${method} with a body and If-Match reaches Sonos unchanged`, async () => {
    const r = rig();
    const body = JSON.stringify({ ids: ['a', 'b'], insertAt: 2 });
    const res = await r.send('/sonos/api/content/v1/groups/G/queues/Q/resources', {
      method,
      headers: { 'content-type': 'application/json', 'if-match': '"etag-9"' },
      body,
    });
    const call = onlyCall(r.upstream);
    assert.equal(call.method, method, `Expected the ${method} method to pass through`);
    assert.equal(call.body.toString('utf8'), body, `Expected the ${method} body to reach Sonos unchanged`);
    assert.equal(call.headers.get('if-match'), '"etag-9"', 'Expected If-Match to pass through');
    assert.equal(res.status, 200, 'Expected Sonos’s 200 back');
  });
}

test('GW-2: Content-Type, Accept, If-Match, If-None-Match and X-Sonos-* headers pass through to Sonos', async () => {
  const r = rig();
  await r.send(GROUPS, {
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'if-match': '"m1"',
      'if-none-match': '"n1"',
      'x-sonos-timezone': '+01:00',
      'x-sonos-debug': 'use-section-text=true',
    },
  });
  const h = onlyCall(r.upstream).headers;
  assert.equal(h.get('accept'), 'application/json', 'Expected Accept to pass through');
  assert.equal(h.get('content-type'), 'application/json', 'Expected Content-Type to pass through');
  assert.equal(h.get('if-match'), '"m1"', 'Expected If-Match to pass through');
  assert.equal(h.get('if-none-match'), '"n1"', 'Expected If-None-Match to pass through');
  assert.equal(h.get('x-sonos-timezone'), '+01:00', 'Expected X-Sonos-Timezone to pass through');
  assert.equal(h.get('x-sonos-debug'), 'use-section-text=true', 'Expected X-Sonos-Debug to pass through');
});

test('GW-2: percent-encoded path segments reach Sonos still encoded', async () => {
  const r = rig();
  await r.send(
    '/sonos/api/content/v1/households/H/services/S/accounts/A/catalog/containers/spotify%3Aalbum%3A1%2F2/resources'
  );
  assert.equal(
    onlyCall(r.upstream).url.pathname,
    '/api/content/v1/households/H/services/S/accounts/A/catalog/containers/spotify%3Aalbum%3A1%2F2/resources',
    'Expected the encoded path to be forwarded as it came (decoding %2F would change which resource is meant)'
  );
});

// An image (album art) is not text: every byte value must survive, so a UTF-8 round trip would fail this.
test('GW-2: a binary response (an image) comes back byte for byte with its Content-Type', async () => {
  const r = rig();
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(Array.from({ length: 256 }, (_, i) => i)),
    Buffer.from([0xff, 0xfe, 0x00]),
  ]);
  r.upstream.responder = () =>
    reply(200, png, { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400', etag: '"img1"' });
  const res = await r.send('/sonos/api/art/v1/albums/1.png');
  assert.equal(res.status, 200, 'Expected Sonos’s 200');
  assert.ok(
    bodyBytes(res).equals(png),
    `Expected ${png.length} image bytes back unchanged, got ${bodyBytes(res).length} different bytes`
  );
  assert.equal(header(res, 'content-type'), 'image/png', 'Expected the image Content-Type');
  assert.equal(header(res, 'cache-control'), 'public, max-age=86400', 'Expected Cache-Control to pass through');
});

test('GW-2: a binary request body is delivered to Sonos byte for byte', async () => {
  const r = rig();
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...Array.from({ length: 256 }, (_, i) => 255 - i)]);
  await r.send('/sonos/api/upload', {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: bytes,
  });
  assert.ok(onlyCall(r.upstream).body.equals(bytes), 'Expected the binary request body to reach Sonos unchanged');
});

for (const status of [201, 204, 304, 400, 403, 404, 409, 412, 429, 500, 503]) {
  // Whatever Sonos answers (other than 401), the client gets the same status and body, and the request is sent once.
  test(`GW-2: Sonos’s ${status} comes back as ${status} with its body, and the request is not repeated`, async () => {
    const r = rig();
    r.upstream.responder = () => reply(status, `detail for ${status}`, { 'content-type': 'text/plain' });
    const res = await r.send(GROUPS, { method: 'POST', body: '{}' });
    assert.equal(res.status, status, `Expected status ${status} to pass through`);
    const empty = status === 204 || status === 304;
    assert.equal(bodyText(res), empty ? '' : `detail for ${status}`, 'Expected Sonos’s body to pass through');
    assert.equal(r.upstream.calls.length, 1, `Expected a ${status} not to be retried`);
    assert.equal(r.stub.refreshes(), 0, `Expected a ${status} not to refresh the session`);
  });
}

// Ten colleagues' apps call at the same moment: ten answers, one Sonos login (the session's job, seen through the gateway).
test('GW-2: ten concurrent first requests cause one Sonos login and are all served with its session', async () => {
  const r = realRig();
  const results = await Promise.all(Array.from({ length: 10 }, () => r.send(GROUPS)));
  assert.deepEqual(
    results.map((x) => x.status),
    Array(10).fill(200),
    'Expected ten 200s'
  );
  assert.equal(
    r.sonos.counts.sessionsIssued,
    1,
    `Expected one Sonos login, Sonos issued ${r.sonos.counts.sessionsIssued} sessions`
  );
  const cookies = new Set(
    r.upstream.calls.filter((c) => c.url.pathname.startsWith('/api/groups')).map((c) => c.headers.get('cookie'))
  );
  assert.deepEqual(
    [...cookies],
    [`${SESSION_COOKIE}=sonos-jwe-1.AbCdEf==`],
    'Expected every call to carry the one session Sonos issued'
  );
});

// ── GW-3: the client cannot choose the host, smuggle a cookie or receive Set-Cookie ─

const SMUGGLING_HEADERS = {
  host: 'evil.example',
  'x-forwarded-host': 'evil.example',
  'x-forwarded-proto': 'http',
  forwarded: 'host=evil.example;proto=http',
  'x-original-url': 'https://evil.example/api/x',
  origin: 'https://evil.example',
  referer: 'https://evil.example/page',
  cookie: `${SESSION_COOKIE}=attacker-session; other=1`,
};

test('GW-3: the client’s Cookie, Authorization, Host, Origin, Referer and User-Agent are not sent to Sonos', async () => {
  const r = rig();
  await r.send(GROUPS, {
    headers: { ...SMUGGLING_HEADERS, 'user-agent': 'curl/8.4.0', 'proxy-authorization': 'Basic Zm9vOmJhcg==' },
  });
  const h = onlyCall(r.upstream).headers;
  assert.equal(
    h.get('cookie'),
    `${SESSION_COOKIE}=sess-old`,
    'Expected only the server’s session cookie, none of the client’s cookies'
  );
  assert.ok(
    !(h.get('cookie') ?? '').includes('attacker-session'),
    'Expected the client’s own session cookie to be dropped'
  );
  assert.equal(h.get('authorization'), null, 'Expected the Entra token never to be sent to Sonos');
  assert.ok(
    ![...h.values()].some((v) => v.includes(GOOD_TOKEN)),
    'Expected the Entra token to appear in no header sent to Sonos'
  );
  assert.equal(h.get('proxy-authorization'), null, 'Expected Proxy-Authorization to be dropped');
  assert.ok(
    [null, 'play.sonos.com'].includes(h.get('host')),
    `Expected the client’s Host to be dropped, got "${h.get('host')}"`
  );
  assert.equal(h.get('origin'), null, 'Expected the client’s Origin to be dropped');
  assert.equal(
    h.get('referer'),
    `${PLAY_ORIGIN}/en-us/web-app`,
    'Expected Referer to be the Sonos web app, not the client’s'
  );
  assert.ok(!(h.get('user-agent') ?? '').includes('curl'), 'Expected the client’s User-Agent to be replaced');
});

test('GW-3: header names are filtered whatever their case, and a Cookie given as a list is dropped too', async () => {
  const r = rig();
  await r.send(GROUPS, {
    headers: {
      Cookie: `${SESSION_COOKIE}=attacker-session`,
      COOKIE: 'x=1',
      ORIGIN: 'https://evil.example',
      'User-agent': 'curl/8',
      HOST: 'evil.example',
      'X-Sonos-Timezone': '+01:00',
    } as Record<string, string>,
  });
  await r.send(GROUPS, { headers: { cookie: [`${SESSION_COOKIE}=attacker-session`, 'b=2'] } });
  for (const call of r.upstream.calls) {
    const cookie = call.headers.get('cookie') ?? '';
    assert.equal(cookie, `${SESSION_COOKIE}=sess-old`, `Expected only the server’s cookie, got "${cookie}"`);
    assert.equal(call.headers.get('origin'), null, 'Expected Origin to be dropped whatever its case');
    assert.ok(
      !(call.headers.get('user-agent') ?? '').includes('curl'),
      'Expected User-Agent to be replaced whatever its case'
    );
  }
  assert.equal(
    r.upstream.calls[0].headers.get('x-sonos-timezone'),
    '+01:00',
    'Expected an ordinary header to pass through whatever its case'
  );
});

test('GW-3: hop-by-hop headers from the client are not sent to Sonos', async () => {
  const r = rig();
  await r.send(GROUPS, {
    method: 'POST',
    body: '{}',
    headers: {
      connection: 'keep-alive',
      'keep-alive': 'timeout=5',
      te: 'trailers',
      trailer: 'Expires',
      'transfer-encoding': 'chunked',
      upgrade: 'websocket',
    },
  });
  const h = onlyCall(r.upstream).headers;
  for (const name of ['connection', 'keep-alive', 'te', 'trailer', 'transfer-encoding', 'upgrade']) {
    assert.equal(h.get(name), null, `Expected the hop-by-hop header ${name} not to be forwarded`);
  }
});

// Sonos hands out cookies of its own (and could rotate the session cookie): none may reach a client.
test('GW-3: Set-Cookie from Sonos is never passed to the client', async () => {
  const r = rig();
  const res = await r.send(GROUPS);
  assert.equal(res.status, 200);
  assert.ok(
    !headerNames(res).includes('set-cookie'),
    `Expected no Set-Cookie header, got ${headerNames(res).join(', ')}`
  );
  assert.ok(
    !JSON.stringify(res.headers).includes('rotated-by-sonos'),
    'Expected no cookie value in any response header'
  );
  assert.equal((bodyJson(res) as { ok?: boolean }).ok, true, 'Expected the rest of the response to be intact');
});

test('GW-3: a redirect from Sonos is passed to the client, not followed with the session cookie', async () => {
  const r = rig();
  r.upstream.responder = () => reply(302, null, { location: 'https://evil.example/steal' });
  const res = await r.send(GROUPS);
  assert.equal(res.status, 302, 'Expected the 302 to be passed through');
  assert.equal(
    header(res, 'location'),
    'https://evil.example/steal',
    'Expected Location to be passed through unchanged'
  );
  assert.deepEqual(
    r.upstream.stray().map((c) => c.url.href),
    [],
    'Expected no request to any other host (the session cookie must not follow a redirect)'
  );
});

// Whatever the client puts in the request, every call the gateway makes goes to https://play.sonos.com/api/...
const HOSTILE_URLS = [
  'https://evil.example/sonos/api/x',
  '//evil.example/sonos/api/x',
  '/sonos/api/../../admin',
  '/sonos/api/%2e%2e/%2e%2e/admin',
  '/sonos/api/%2E%2E/admin',
  '/sonos/api\\..\\..\\admin',
  '/sonos/api//evil.example/x',
  '/sonos/api/https://evil.example/x',
  '/sonos/api/x?url=https://evil.example/&host=evil.example',
  '/sonos/api@evil.example/x',
  '/sonos//evil.example/api/x',
  '/sonos/https://evil.example/api/x',
  '/sonos/%2f%2fevil.example/api/x',
  '/sonos/%2e%2e/api/x',
  '/sonos/./api/x',
];

for (const url of HOSTILE_URLS) {
  test(`GW-3: ${url} (with Host and X-Forwarded-Host set to evil.example) never reaches any host but https://play.sonos.com/api/`, async () => {
    const r = rig();
    const res = await r.send(url, { headers: SMUGGLING_HEADERS });
    assert.ok(res.status < 500, `Expected a considered answer (forwarded, or refused), got ${res.status}`);
    for (const call of r.upstream.calls) {
      assert.equal(
        call.url.origin,
        PLAY_ORIGIN,
        `Expected the upstream host to stay play.sonos.com, but a request went to ${call.url.href}`
      );
      assert.ok(
        call.url.pathname.startsWith('/api/'),
        `Expected only /api/... to be reachable, but a request went to ${call.url.href}`
      );
      assert.ok(
        !call.url.pathname.split('/').includes('..'),
        `Expected no ".." segment upstream, got ${call.url.href}`
      );
    }
  });
}

// ── 404s: only /sonos/api/... is forwarded ────────────────────────────────────

for (const url of [
  '/sonos',
  '/sonos/',
  '/sonos/api',
  '/sonos/apix/groups',
  '/sonos/en-us/web-app',
  '/sonos/auth/csrf',
  '/sonos/ws',
  '/sonos//evil.example/api/x',
  '/sonos/https://evil.example/api/x',
  '/sonos/%2f%2fevil.example/api/x',
  '/sonos/%2e%2e/api/x',
]) {
  // Given a signed-in caller, a /sonos/ path whose rest does not begin with "api/" is a 404 and Sonos is not called.
  test(`GW-3: ${url} is 404 and nothing is sent to Sonos`, async () => {
    const r = rig();
    const res = await r.send(url);
    assert.equal(res.status, 404, `Expected 404 for ${url}, which is not under /sonos/api/`);
    assertNothingReachedSonos(r, `for ${url}`);
  });
}

for (const url of ['/', '/health', '/api/groups/v1/households/H/groups', '/sonosx/api/x', '/healthz/extra', '/other']) {
  // Anything that is neither /sonos/..., /healthz nor... is a 404, whoever is asking.
  test(`GW-3: ${url} is 404 and nothing is sent to Sonos`, async () => {
    const r = rig();
    const res = await r.send(url);
    assert.equal(res.status, 404, `Expected 404 for ${url}`);
    assertNothingReachedSonos(r, `for ${url}`);
  });
}

for (const url of [
  '/sonos/api/auth/session',
  '/sonos/api/auth/signout',
  '/sonos/api/auth/csrf',
  '/sonos/api/AUTH/session',
  '/sonos/api/x/../auth/session',
  '/sonos/api/%61uth/session',
]) {
  // next-auth's endpoints act on the shared service session itself, so a signed-in caller cannot reach them.
  test(`GW-3: ${url} is 404 and nothing is sent to Sonos`, async () => {
    const r = rig();
    const res = await r.send(url);
    assert.equal(res.status, 404, `Expected 404 for ${url}: the session's own endpoints are not forwarded`);
    assertNothingReachedSonos(r, `for ${url}`);
  });
}

// ── GW-4: a Sonos 401 is healed once; a failed login is a named 502; no secrets leak ─

// Given Sonos rejects the cached session, the gateway asks the session to refresh, sends the SAME request with
// the new session, and the caller sees only the success.
test('GW-4: a Sonos 401 is healed by one session refresh and one retry of the same request', async () => {
  const r = rig({ accept: ['sess-new'] });
  const res = await r.send(`${GROUPS}?x=1`, { headers: { 'if-none-match': '"e"' } });
  assert.equal(res.status, 200, 'Expected the caller to see the retried request’s 200, not the 401');
  assert.deepEqual(
    r.stub.calls,
    [{ refresh: false }, { refresh: true }],
    'Expected one cached lookup, then exactly one refresh'
  );
  assert.equal(r.upstream.calls.length, 2, 'Expected exactly two requests to Sonos: the 401 and the retry');
  const [first, second] = r.upstream.calls;
  assert.equal(
    first.headers.get('cookie'),
    `${SESSION_COOKIE}=sess-old`,
    'Expected the first attempt to use the cached session'
  );
  assert.equal(
    second.headers.get('cookie'),
    `${SESSION_COOKIE}=sess-new`,
    'Expected the retry to use the refreshed session'
  );
  assert.equal(second.url.href, first.url.href, 'Expected the retry to go to the same URL');
  assert.equal(second.headers.get('if-none-match'), '"e"', 'Expected the retry to carry the same headers');
});

test('GW-4: the retry of a POST carries the same body and headers as the first attempt', async () => {
  const r = rig({ accept: ['sess-new'] });
  const body = JSON.stringify({ uri: 'x', note: 'café' });
  const res = await r.send(GROUPS, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'if-match': '"q"' },
    body,
  });
  assert.equal(res.status, 200, 'Expected the retried POST to succeed');
  assert.equal(r.upstream.calls.length, 2, 'Expected one retry');
  for (const [i, call] of r.upstream.calls.entries()) {
    assert.equal(call.method, 'POST', `Expected attempt ${i + 1} to be a POST`);
    assert.equal(
      call.body.toString('utf8'),
      body,
      `Expected attempt ${i + 1} to carry the whole body (a body stream can only be read once)`
    );
    assert.equal(
      call.headers.get('content-type'),
      'application/json',
      `Expected attempt ${i + 1} to carry Content-Type`
    );
    assert.equal(call.headers.get('if-match'), '"q"', `Expected attempt ${i + 1} to carry If-Match`);
  }
});

// Given Sonos still says 401 after the refresh, that 401 is the answer, and nothing more is tried.
test('GW-4: a second Sonos 401 is passed through, after exactly one refresh and one retry', async () => {
  const r = rig({ accept: [] });
  const res = await r.send(GROUPS);
  assert.equal(res.status, 401, 'Expected Sonos’s second 401 to be passed through');
  assert.deepEqual(bodyJson(res), { error: 'unauthorised' }, 'Expected Sonos’s own 401 body');
  assert.equal(r.upstream.calls.length, 2, 'Expected one attempt and one retry, no more');
  assert.equal(r.stub.refreshes(), 1, 'Expected exactly one refresh');
});

test('GW-4: a Sonos 403 is not mistaken for an expired session', async () => {
  const r = rig();
  r.upstream.responder = () => reply(403, 'forbidden');
  const res = await r.send(GROUPS);
  assert.equal(res.status, 403, 'Expected the 403 to pass through');
  assert.equal(r.stub.refreshes(), 0, 'Expected no refresh for a 403');
  assert.equal(r.upstream.calls.length, 1, 'Expected no retry for a 403');
});

// Several apps hit the expired session at once: every request is healed, and Sonos sees one new login.
test('GW-4: ten concurrent requests that all get a Sonos 401 are healed by one new Sonos login', async () => {
  const r = realRig();
  const first = await r.send(GROUPS);
  assert.equal(first.status, 200, 'Expected the first request to log in and succeed');
  r.sonos.expireAllSessions();
  const results = await Promise.all(Array.from({ length: 10 }, () => r.send(GROUPS)));
  assert.deepEqual(
    results.map((x) => x.status),
    Array(10).fill(200),
    'Expected every request to be healed and answered 200'
  );
  assert.equal(
    r.sonos.counts.sessionsIssued,
    2,
    `Expected exactly one new login, Sonos issued ${r.sonos.counts.sessionsIssued} sessions in all`
  );
});

test('GW-4: when the Sonos login fails, the caller gets 502 { error: "sonos-login-failed" } and Sonos is not called', async () => {
  const stub = createStubSession();
  stub.failAll(loginError());
  const r = rig({ session: stub });
  const res = await r.send(GROUPS);
  assert.equal(res.status, 502, 'Expected 502 when Sonos cannot produce a session');
  assert.match(header(res, 'content-type') ?? '', jsonType, 'Expected a JSON error');
  assert.deepEqual(
    bodyJson(res),
    { error: 'sonos-login-failed' },
    'Expected exactly { error: "sonos-login-failed" } and no detail of why'
  );
  assert.equal(r.upstream.calls.length, 0, 'Expected no request to Sonos without a session');
});

test('GW-4: when the refresh after a Sonos 401 cannot log in, the caller gets 502 sonos-login-failed', async () => {
  const stub = createStubSession();
  stub.failRefresh(loginError());
  const r = rig({ session: stub, accept: [] });
  const res = await r.send(GROUPS);
  assert.equal(res.status, 502, 'Expected 502 when the re-login fails');
  assert.deepEqual(bodyJson(res), { error: 'sonos-login-failed' }, 'Expected exactly { error: "sonos-login-failed" }');
  assert.equal(r.upstream.calls.length, 1, 'Expected no retry once the session could not be refreshed');
});

test('GW-4: when Sonos is unreachable, the caller gets 502 { error: "sonos-unreachable" } with no detail of the cause', async () => {
  const unreachable = (async () => {
    throw new TypeError(`fetch failed: connect ECONNREFUSED play.sonos.com Cookie: ${SESSION_COOKIE}=sess-old`);
  }) as typeof fetch;
  const r = rig({ fetch: () => unreachable });
  const res = await r.send(GROUPS);
  assert.equal(res.status, 502, 'Expected 502 when Sonos cannot be reached');
  assert.match(header(res, 'content-type') ?? '', jsonType, 'Expected a JSON error');
  assert.deepEqual(bodyJson(res), { error: 'sonos-unreachable' }, 'Expected exactly { error: "sonos-unreachable" }');
  assert.ok(!r.logs.join('\n').includes('sess-old'), 'Expected the session token not to be logged with the failure');
});

test('GW-4: when Sonos becomes unreachable during the retry, the caller still gets 502 sonos-unreachable', async () => {
  let calls = 0;
  const r = rig({
    accept: ['sess-new'],
    // The first attempt is answered (401: the session is stale); the retry cannot connect.
    fetch: (upstream) =>
      (async (...args: Parameters<typeof fetch>) => {
        if (++calls > 1) throw new TypeError('fetch failed');
        return upstream.fetch(...args);
      }) as typeof fetch,
  });
  const res = await r.send(GROUPS);
  assert.equal(res.status, 502, 'Expected 502 when the retry cannot reach Sonos');
  assert.deepEqual(bodyJson(res), { error: 'sonos-unreachable' }, 'Expected exactly { error: "sonos-unreachable" }');
});

// Okta echoes the request back in its error body, password included: nothing of it may reach the response or the logs.
test('GW-4: a failing Sonos login leaks neither the password nor any session token into the response or the logs', async () => {
  const r = realRig();
  r.sonos.fault = 'mfa-required';
  r.sonos.echoCredentials = true;
  const res = await r.send(GROUPS);
  assert.equal(res.status, 502, 'Expected 502 when Okta answers MFA_REQUIRED');
  assert.deepEqual(bodyJson(res), { error: 'sonos-login-failed' });
  const everything = `${JSON.stringify(res.headers)}\n${bodyText(res)}\n${r.logs.join('\n')}`;
  assert.ok(!everything.includes(SONOS_PASSWORD), 'Expected the password to be absent from the response and the logs');
  assert.ok(
    !everything.includes(GOOD_TOKEN),
    'Expected the caller’s Entra token to be absent from the response and the logs'
  );

  r.sonos.fault = null;
  const recovered = await r.send(GROUPS);
  assert.equal(
    recovered.status,
    200,
    'Expected the next request to try the login again and succeed once Sonos is healthy'
  );
});

test('GW-4: on a served request and a healed one, the Sonos session token and the Entra token are neither returned nor logged', async () => {
  const r = realRig();
  const served = await r.send(GROUPS);
  r.sonos.expireAllSessions();
  const healed = await r.send(GROUPS);
  const issued = ['sonos-jwe-1.AbCdEf==', 'sonos-jwe-2.AbCdEf=='];
  assert.equal(served.status, 200);
  assert.equal(healed.status, 200, 'Expected the healed request to succeed');
  const everything =
    [served, healed].map((x) => `${JSON.stringify(x.headers)}\n${bodyText(x)}`).join('\n') + `\n${r.logs.join('\n')}`;
  for (const secret of [...issued, GOOD_TOKEN, SONOS_PASSWORD]) {
    assert.ok(!everything.includes(secret), `Expected "${secret}" to appear in no response and no log line`);
  }
});

// ── GW-7: /healthz ────────────────────────────────────────────────────────────

test('GW-7: GET /healthz answers 200 { ok: true } with no Authorization header and makes no Sonos call', async () => {
  const r = rig();
  const res = await r.send('/healthz', { auth: null });
  assert.equal(res.status, 200, 'Expected 200 without any sign-in');
  assert.deepEqual(bodyJson(res), { ok: true }, 'Expected exactly { ok: true }');
  assert.match(header(res, 'content-type') ?? '', jsonType, 'Expected a JSON response');
  assertNothingReachedSonos(r, 'for a health probe');
});

test('GW-7: GET /healthz answers 200 even with an Authorization header that would not verify', async () => {
  const r = rig();
  const res = await r.send('/healthz', { auth: 'Bearer junk' });
  assert.equal(res.status, 200, 'Expected the probe not to depend on the token');
  assertNothingReachedSonos(r, 'for a health probe');
});

// ── routing: the handler can be built without a log function ─────────────────

test('GW-2: the handler works without a log function', async () => {
  const upstream = createFakeUpstream();
  upstream.accept('sess-old');
  const req: GatewayRequest = gatewayRequest(GROUPS);
  const handler = createGatewayHandler({
    session: createStubSession().session,
    fetch: upstream.fetch,
    verify: stubVerify().verify,
  });
  const res = await handler(req);
  assert.equal(res.status, 200, 'Expected the request to be served with log omitted');
});
