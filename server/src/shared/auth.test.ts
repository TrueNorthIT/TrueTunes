// Run: npm test (from server/).
//
// The Entra token check in server/src/shared/auth.ts, against keys generated here
// (no network beyond a loopback JWKS server): signature, issuer, audience,
// expiry, the oid claim and fetching the keys from a URL, then the
// request-level rule the functions use while AUTH_ENFORCE rolls out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createRemoteJWKSet } from 'jose';
import { authenticate, verifyEntraToken } from './auth';
import { CLIENT, ISSUER, OID, fakeContext, fakeRequest, tenantKeys } from './authKit.testkit';

const rejects = (p: Promise<unknown>) => assert.rejects(p);

test('a token signed by the tenant, for this app, in date, yields its oid', async () => {
  const { check, sign } = await tenantKeys();
  assert.equal(await verifyEntraToken(await sign(), check), OID);
});

test('a token signed by another key is rejected, even when it claims the right kid', async () => {
  const { check, sign, rogue } = await tenantKeys();
  await rejects(verifyEntraToken(await sign(undefined, { key: rogue }), check));
  await rejects(verifyEntraToken(await sign(undefined, { key: rogue, kid: 'good' }), check));
});

test('another issuer (a different tenant) is rejected', async () => {
  const { check, sign } = await tenantKeys();
  await rejects(
    verifyEntraToken(
      await sign(undefined, { iss: 'https://login.microsoftonline.com/99999999-0000-0000-0000-000000000000/v2.0' }),
      check
    )
  );
});

test('a token for another app (audience) is rejected', async () => {
  const { check, sign } = await tenantKeys();
  await rejects(verifyEntraToken(await sign(undefined, { aud: '00000003-0000-0000-c000-000000000000' }), check));
});

test('an expired token is rejected', async () => {
  const { check, sign } = await tenantKeys();
  const twoHoursAgo = Math.floor(Date.now() / 1000) - 2 * 3600;
  await rejects(verifyEntraToken(await sign(undefined, { exp: twoHoursAgo }), check));
});

test('a token without an oid is rejected', async () => {
  const { check, sign } = await tenantKeys();
  await rejects(verifyEntraToken(await sign({ name: 'No Oid' }), check));
});

test('an unsigned (alg none) token is rejected', async () => {
  const { check } = await tenantKeys();
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ iss: ISSUER, aud: CLIENT, exp: now + 3600, oid: OID })}.`;
  await rejects(verifyEntraToken(unsigned, check));
});

test('keys fetched from a JWKS URL, shaped like Entra publishes them, verify tokens and are cached', async () => {
  // Production builds its check with createRemoteJWKSet (fetch since jose 6). Entra's keys
  // carry no `alg` and some extra members, so serve them like that from a local server.
  const { sign, good, rogue } = await tenantKeys();
  const { alg: _alg, ...entraKey } = { ...good.jwk, x5t: 'thumb', issuer: ISSUER };
  let fetches = 0;
  const server = createServer((_req, res) => {
    fetches++;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ keys: [entraKey] }));
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  try {
    const { port } = server.address() as AddressInfo;
    const check = { issuer: ISSUER, audience: CLIENT, keys: createRemoteJWKSet(new URL(`http://127.0.0.1:${port}/keys`)) };
    assert.equal(await verifyEntraToken(await sign(), check), OID);
    assert.equal(await verifyEntraToken(await sign(), check), OID);
    assert.equal(fetches, 1);
    await rejects(verifyEntraToken(await sign(undefined, { key: rogue }), check));
  } finally {
    server.close();
  }
});

// ── authenticate(): what a function does with the Authorization header ───────

test('valid token: the caller is the token oid', async () => {
  const { check, sign } = await tenantKeys();
  const { ctx } = fakeContext();
  assert.deepEqual(await authenticate(fakeRequest(`Bearer ${await sign()}`), ctx, check, false), { oid: OID });
  assert.deepEqual(await authenticate(fakeRequest(`Bearer ${await sign()}`), ctx, check, true), { oid: OID });
});

test('invalid token: 401, whether or not enforcement is on', async () => {
  const { check, sign, rogue } = await tenantKeys();
  const { ctx } = fakeContext();
  for (const enforce of [false, true]) {
    const bad = await authenticate(fakeRequest(`Bearer ${await sign(undefined, { key: rogue })}`), ctx, check, enforce);
    assert.equal('response' in bad && bad.response.status, 401);
    const malformed = await authenticate(fakeRequest('Basic dXNlcjpwYXNz'), ctx, check, enforce);
    assert.equal('response' in malformed && malformed.response.status, 401);
  }
});

test('no token: allowed and logged while AUTH_ENFORCE is off, 401 once it is on', async () => {
  const { check } = await tenantKeys();
  const { ctx, warnings } = fakeContext();
  assert.deepEqual(await authenticate(fakeRequest(), ctx, check, false), { oid: null });
  assert.equal(warnings.length, 1);
  const enforced = await authenticate(fakeRequest(), ctx, check, true);
  assert.equal('response' in enforced && enforced.response.status, 401);
});

test('token but no tenant configured: treated as anonymous while not enforcing, 500 when enforcing', async () => {
  const { sign } = await tenantKeys();
  const { ctx } = fakeContext();
  assert.deepEqual(await authenticate(fakeRequest(`Bearer ${await sign()}`), ctx, undefined, false), { oid: null });
  const enforced = await authenticate(fakeRequest(`Bearer ${await sign()}`), ctx, undefined, true);
  assert.equal('response' in enforced && enforced.response.status, 500);
});
