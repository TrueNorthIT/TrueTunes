// Run: npm test (from server/).
//
// The Entra token check in server/src/shared/auth.ts, against keys generated here
// (no network): signature, issuer, audience, expiry and the oid claim, then the
// request-level rule the functions use while AUTH_ENFORCE rolls out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK } from 'jose';
import type { HttpRequest, InvocationContext } from '@azure/functions';
import { authenticate, verifyEntraToken, type EntraTokenCheck } from './auth';

const TENANT = '11111111-1111-1111-1111-111111111111';
const CLIENT = '22222222-2222-2222-2222-222222222222';
const ISSUER = `https://login.microsoftonline.com/${TENANT}/v2.0`;
const OID = '33333333-3333-3333-3333-333333333333';

async function keyPair(kid: string) {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' };
  return { privateKey, jwk };
}

async function setup() {
  const good = await keyPair('good');
  const rogue = await keyPair('rogue');
  const check: EntraTokenCheck = { issuer: ISSUER, audience: CLIENT, keys: createLocalJWKSet({ keys: [good.jwk] }) };
  const sign = (
    claims: Record<string, unknown> = { oid: OID },
    opts: { key?: typeof good; iss?: string; aud?: string; exp?: number | string; kid?: string } = {}
  ) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: opts.kid ?? (opts.key ?? good).jwk.kid })
      .setIssuer(opts.iss ?? ISSUER)
      .setAudience(opts.aud ?? CLIENT)
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? '1h')
      .sign((opts.key ?? good).privateKey);
  return { check, sign, rogue };
}

const rejects = (p: Promise<unknown>) => assert.rejects(p);

test('a token signed by the tenant, for this app, in date, yields its oid', async () => {
  const { check, sign } = await setup();
  assert.equal(await verifyEntraToken(await sign(), check), OID);
});

test('a token signed by another key is rejected, even when it claims the right kid', async () => {
  const { check, sign, rogue } = await setup();
  await rejects(verifyEntraToken(await sign(undefined, { key: rogue }), check));
  await rejects(verifyEntraToken(await sign(undefined, { key: rogue, kid: 'good' }), check));
});

test('another issuer (a different tenant) is rejected', async () => {
  const { check, sign } = await setup();
  await rejects(
    verifyEntraToken(
      await sign(undefined, { iss: 'https://login.microsoftonline.com/99999999-0000-0000-0000-000000000000/v2.0' }),
      check
    )
  );
});

test('a token for another app (audience) is rejected', async () => {
  const { check, sign } = await setup();
  await rejects(verifyEntraToken(await sign(undefined, { aud: '00000003-0000-0000-c000-000000000000' }), check));
});

test('an expired token is rejected', async () => {
  const { check, sign } = await setup();
  const twoHoursAgo = Math.floor(Date.now() / 1000) - 2 * 3600;
  await rejects(verifyEntraToken(await sign(undefined, { exp: twoHoursAgo }), check));
});

test('a token without an oid is rejected', async () => {
  const { check, sign } = await setup();
  await rejects(verifyEntraToken(await sign({ name: 'No Oid' }), check));
});

test('an unsigned (alg none) token is rejected', async () => {
  const { check } = await setup();
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ iss: ISSUER, aud: CLIENT, exp: now + 3600, oid: OID })}.`;
  await rejects(verifyEntraToken(unsigned, check));
});

// ── authenticate(): what a function does with the Authorization header ───────

function request(authorization?: string): HttpRequest {
  const headers = new Headers(authorization ? { authorization } : {});
  return { headers, method: 'POST', url: 'https://fn.example/api/profile/rename' } as unknown as HttpRequest;
}

function context() {
  const warnings: string[] = [];
  const ctx = {
    log: () => {},
    warn: (...a: unknown[]) => warnings.push(a.join(' ')),
    error: (...a: unknown[]) => warnings.push(a.join(' ')),
  } as unknown as InvocationContext;
  return { ctx, warnings };
}

test('valid token: the caller is the token oid', async () => {
  const { check, sign } = await setup();
  const { ctx } = context();
  assert.deepEqual(await authenticate(request(`Bearer ${await sign()}`), ctx, check, false), { oid: OID });
  assert.deepEqual(await authenticate(request(`Bearer ${await sign()}`), ctx, check, true), { oid: OID });
});

test('invalid token: 401, whether or not enforcement is on', async () => {
  const { check, sign, rogue } = await setup();
  const { ctx } = context();
  for (const enforce of [false, true]) {
    const bad = await authenticate(request(`Bearer ${await sign(undefined, { key: rogue })}`), ctx, check, enforce);
    assert.equal('response' in bad && bad.response.status, 401);
    const malformed = await authenticate(request('Basic dXNlcjpwYXNz'), ctx, check, enforce);
    assert.equal('response' in malformed && malformed.response.status, 401);
  }
});

test('no token: allowed and logged while AUTH_ENFORCE is off, 401 once it is on', async () => {
  const { check } = await setup();
  const { ctx, warnings } = context();
  assert.deepEqual(await authenticate(request(), ctx, check, false), { oid: null });
  assert.equal(warnings.length, 1);
  const enforced = await authenticate(request(), ctx, check, true);
  assert.equal('response' in enforced && enforced.response.status, 401);
});

test('token but no tenant configured: treated as anonymous while not enforcing, 500 when enforcing', async () => {
  const { sign } = await setup();
  const { ctx } = context();
  assert.deepEqual(await authenticate(request(`Bearer ${await sign()}`), ctx, undefined, false), { oid: null });
  const enforced = await authenticate(request(`Bearer ${await sign()}`), ctx, undefined, true);
  assert.equal('response' in enforced && enforced.response.status, 500);
});
