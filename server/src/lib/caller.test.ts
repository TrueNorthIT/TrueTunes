// Run: npm test (from server/).
//
// callerName in server/src/lib/caller.ts: which display name a write acts as. The profile
// lookup is a stub, so nothing here touches Cosmos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { callerName } from './caller';
import { OID, fakeContext, fakeRequest, tenantKeys } from '../shared/authKit.testkit';

const profileOf = (name: string | null) => async (oid: string) => (oid === OID ? name : null);

test('a token with a claimed profile acts as that profile, whatever the body claims', async () => {
  const { check, sign } = await tenantKeys();
  const { ctx } = fakeContext();
  for (const enforce of [false, true]) {
    const r = await callerName(fakeRequest(`Bearer ${await sign()}`), ctx, 'Someone Else', {
      lookup: profileOf('Priya Shah'),
      check,
      enforce,
    });
    assert.deepEqual(r, { name: 'Priya Shah' });
  }
});

test('a valid token with no claimed profile keeps the claimed name while AUTH_ENFORCE is off, and says so', async () => {
  const { check, sign } = await tenantKeys();
  const { ctx, warnings } = fakeContext();
  const r = await callerName(fakeRequest(`Bearer ${await sign()}`), ctx, 'Priya Shah', {
    lookup: profileOf(null),
    check,
    enforce: false,
  });
  assert.deepEqual(r, { name: 'Priya Shah' });
  assert.ok(warnings.some((w) => w.includes(`[auth] no profile for oid ${OID}`)));
});

test('a valid token with no claimed profile is refused once AUTH_ENFORCE is on', async () => {
  const { check, sign } = await tenantKeys();
  const { ctx } = fakeContext();
  const r = await callerName(fakeRequest(`Bearer ${await sign()}`), ctx, 'Priya Shah', {
    lookup: profileOf(null),
    check,
    enforce: true,
  });
  assert.equal('response' in r && r.response.status, 403);
});

test('no token: the claimed name while AUTH_ENFORCE is off, 401 once it is on', async () => {
  const { check } = await tenantKeys();
  const { ctx } = fakeContext();
  const lookup = profileOf('Priya Shah');
  assert.deepEqual(await callerName(fakeRequest(), ctx, 'Old Client', { lookup, check, enforce: false }), {
    name: 'Old Client',
  });
  const enforced = await callerName(fakeRequest(), ctx, 'Old Client', { lookup, check, enforce: true });
  assert.equal('response' in enforced && enforced.response.status, 401);
});

test('nothing to act as: 400', async () => {
  const { check, sign } = await tenantKeys();
  const { ctx } = fakeContext();
  const lookup = profileOf(null);
  const noToken = await callerName(fakeRequest(), ctx, '', { lookup, check, enforce: false });
  assert.equal('response' in noToken && noToken.response.status, 400);
  const noProfile = await callerName(fakeRequest(`Bearer ${await sign()}`), ctx, null, {
    lookup,
    check,
    enforce: false,
  });
  assert.equal('response' in noProfile && noProfile.response.status, 400);
});
