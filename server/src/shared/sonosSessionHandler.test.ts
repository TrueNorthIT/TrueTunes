// Run: npm test (from server/).
//
// GET /api/sonos-session[?refresh=1], the function in server/src/functions/sonos-session.ts that
// hands a signed-in colleague's app the shared Sonos web session token.
//
// Contract: header `Authorization: Bearer <Entra ID token>`.
//   200 { token }                      with Cache-Control: no-store
//   401 { error }                      no valid Entra token
//   502 { error: 'sonos-login-failed' } the Sonos login cannot produce a session
//
// The handler is built with createSonosSessionHandler(resolveSession, check?) (the same shape as
// createDjAutoplayHandler): the session and the Entra check are injected, so nothing here
// touches Azure, Okta or Sonos. Entra tokens are signed with keys generated in authKit.testkit.ts.
//
// Requirements covered here (the login logic itself is in sonosSession.test.ts):
//   REQ-2  The server refuses anyone without a valid work sign-in, whatever AUTH_ENFORCE says.
//   REQ-3  Any member of the TrueNorth tenant may get the session; there is no extra allow-list.
//   REQ-4  The server reuses one Sonos login instead of logging in on every request.
//   REQ-5  (server half) refresh=1 asks the session to check itself against Sonos.
//   REQ-6  (server half) A failed Sonos login is a 502 sonos-login-failed, not cached, retried.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSonosSession, SonosLoginError } from './sonosSession';
import { createSonosSessionHandler, getSonosSession } from '../functions/sonos-session';
import { fakeContext, tenantKeys } from './authKit.testkit';
import { SONOS_PASSWORD, SONOS_USERNAME, createFakeSonos, recordingContext, sonosRequest } from './sonosKit.testkit';

type SonosSession = ReturnType<typeof createSonosSession>;
type GetOptions = Parameters<SonosSession['get']>[0];
type Body = { token?: string; error?: string };

/** A session stub that records how it was asked and answers with `result`. */
function stubSession(result: () => Promise<string>) {
  const calls: GetOptions[] = [];
  const session: SonosSession = {
    get: async (opts) => {
      calls.push(opts);
      return result();
    },
  };
  return { session, calls };
}

async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const before = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  const apply = (v: Record<string, string | undefined>) => {
    for (const [k, val] of Object.entries(v)) {
      if (val === undefined) delete process.env[k];
      else process.env[k] = val;
    }
  };
  apply(vars);
  try {
    return await fn();
  } finally {
    apply(before);
  }
}

const bearer = (jwt: string) => `Bearer ${jwt}`;

// ── REQ-2: no valid work sign-in, no session ──────────────────────────────────

for (const flag of [undefined, 'false']) {
  // Given AUTH_ENFORCE is off (unset or 'false') and the request carries no Authorization header,
  // the handler answers 401 { error } and never asks the session for a token (so no Sonos login).
  test(`REQ-2: a request with no token gets 401 and no session while AUTH_ENFORCE is ${flag === undefined ? 'unset' : `'${flag}'`}`, async () => {
    const { check } = await tenantKeys();
    const { session, calls } = stubSession(async () => 'sonos-token');
    const handler = createSonosSessionHandler(() => session, check);
    const res = await withEnv({ AUTH_ENFORCE: flag }, () => handler(sonosRequest(), fakeContext().ctx));
    assert.equal(res.status, 401, 'Expected 401 for a request with no token, even though AUTH_ENFORCE is off');
    assert.equal(typeof (res.jsonBody as Body).error, 'string', 'Expected a JSON body { error } explaining the refusal');
    assert.equal(calls.length, 0, 'Expected no session (and so no Sonos login) for an unauthenticated request');
    assert.equal((res.jsonBody as Body).token, undefined, 'Expected no token in the 401 body');
  });
}

// An unauthenticated caller must not be able to force a re-login either.
test('REQ-2: a refresh request with no token gets 401 and does not touch the session', async () => {
  const { check } = await tenantKeys();
  const { session, calls } = stubSession(async () => 'sonos-token');
  const handler = createSonosSessionHandler(() => session, check);
  const res = await withEnv({ AUTH_ENFORCE: undefined }, () => handler(sonosRequest(undefined, 'refresh=1'), fakeContext().ctx));
  assert.equal(res.status, 401, 'Expected 401 for an unauthenticated refresh');
  assert.equal(calls.length, 0, 'Expected the session to be left alone, so no re-login can be forced anonymously');
});

test('REQ-2: a token signed by a key that is not the tenant\'s gets 401 and no session', async () => {
  const { check, sign, rogue } = await tenantKeys();
  const { session, calls } = stubSession(async () => 'sonos-token');
  const handler = createSonosSessionHandler(() => session, check);
  const res = await withEnv({ AUTH_ENFORCE: 'false' }, async () =>
    handler(sonosRequest(bearer(await sign(undefined, { key: rogue }))), fakeContext().ctx)
  );
  assert.equal(res.status, 401, 'Expected 401 for a token with a forged signature');
  assert.equal(calls.length, 0, 'Expected no session for a forged token');
});

test('REQ-2: a token from another tenant gets 401 and no session', async () => {
  const { check, sign } = await tenantKeys();
  const { session, calls } = stubSession(async () => 'sonos-token');
  const handler = createSonosSessionHandler(() => session, check);
  const other = 'https://login.microsoftonline.com/99999999-0000-0000-0000-000000000000/v2.0';
  const res = await withEnv({ AUTH_ENFORCE: 'false' }, async () =>
    handler(sonosRequest(bearer(await sign(undefined, { iss: other }))), fakeContext().ctx)
  );
  assert.equal(res.status, 401, 'Expected 401 for a token issued by a different tenant');
  assert.equal(calls.length, 0, 'Expected no session for a token from another tenant');
});

test('REQ-2: an expired token gets 401 and no session', async () => {
  const { check, sign } = await tenantKeys();
  const { session, calls } = stubSession(async () => 'sonos-token');
  const handler = createSonosSessionHandler(() => session, check);
  const twoHoursAgo = Math.floor(Date.now() / 1000) - 2 * 3600;
  const res = await withEnv({ AUTH_ENFORCE: 'false' }, async () =>
    handler(sonosRequest(bearer(await sign(undefined, { exp: twoHoursAgo }))), fakeContext().ctx)
  );
  assert.equal(res.status, 401, 'Expected 401 for an expired token');
  assert.equal(calls.length, 0, 'Expected no session for an expired token');
});

test('REQ-2: an Authorization header that is not a Bearer token gets 401 and no session', async () => {
  const { check } = await tenantKeys();
  const { session, calls } = stubSession(async () => 'sonos-token');
  const handler = createSonosSessionHandler(() => session, check);
  const res = await withEnv({ AUTH_ENFORCE: 'false' }, () => handler(sonosRequest('Basic dXNlcjpwYXNz'), fakeContext().ctx));
  assert.equal(res.status, 401, 'Expected 401 for a Basic Authorization header');
  assert.equal(calls.length, 0, 'Expected no session for a malformed Authorization header');
});

// ── REQ-3: any tenant member may have the session ─────────────────────────────

// Given a valid tenant token, the handler answers 200 { token } with Cache-Control: no-store.
test('REQ-3: a valid tenant token gets 200 with the Sonos token and Cache-Control no-store', async () => {
  const { check, sign } = await tenantKeys();
  const { session } = stubSession(async () => 'sonos-jwe-1.AbCdEf==');
  const handler = createSonosSessionHandler(() => session, check);
  const res = await withEnv({ AUTH_ENFORCE: undefined }, async () => handler(sonosRequest(bearer(await sign())), fakeContext().ctx));
  assert.equal(res.status, 200, 'Expected 200 for a valid tenant token');
  assert.deepEqual(res.jsonBody, { token: 'sonos-jwe-1.AbCdEf==' }, 'Expected the body to be exactly { token }');
  const headers = new Headers(res.headers as ConstructorParameters<typeof Headers>[0]);
  assert.equal(headers.get('cache-control'), 'no-store', 'Expected Cache-Control: no-store so the session token is never cached downstream');
});

// There is no allow-list: two different members of the tenant (different oids) both get the session.
test('REQ-3: different tenant members, with no allow-list, each get 200 and the same token', async () => {
  const { check, sign } = await tenantKeys();
  const { session } = stubSession(async () => 'shared-sonos-token');
  const handler = createSonosSessionHandler(() => session, check);
  for (const oid of ['44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555']) {
    const res = await withEnv({ AUTH_ENFORCE: 'false' }, async () =>
      handler(sonosRequest(bearer(await sign({ oid }))), fakeContext().ctx)
    );
    assert.equal(res.status, 200, `Expected 200 for tenant member ${oid}`);
    assert.deepEqual(res.jsonBody, { token: 'shared-sonos-token' }, `Expected the shared token for tenant member ${oid}`);
  }
});

// ── REQ-5 (server half): refresh=1 is passed on to the session ────────────────

test('REQ-5: a request without refresh asks the session for its cached token', async () => {
  const { check, sign } = await tenantKeys();
  const { session, calls } = stubSession(async () => 'sonos-token');
  const handler = createSonosSessionHandler(() => session, check);
  await handler(sonosRequest(bearer(await sign())), fakeContext().ctx);
  assert.equal(calls.length, 1, 'Expected exactly one session lookup');
  assert.ok(!calls[0]?.refresh, 'Expected refresh to be off when the query has no refresh=1');
});

test('REQ-5: GET /api/sonos-session?refresh=1 asks the session to check itself against Sonos', async () => {
  const { check, sign } = await tenantKeys();
  const { session, calls } = stubSession(async () => 'sonos-token');
  const handler = createSonosSessionHandler(() => session, check);
  const res = await handler(sonosRequest(bearer(await sign()), 'refresh=1'), fakeContext().ctx);
  assert.equal(res.status, 200);
  assert.equal(calls.length, 1, 'Expected exactly one session lookup');
  assert.equal(calls[0]?.refresh, true, 'Expected get({ refresh: true }) when the query is refresh=1');
});

// ── REQ-6 (server half): a failed Sonos login is a 502 ────────────────────────

// Given the session throws SonosLoginError, the handler answers exactly 502 { error: 'sonos-login-failed' }.
test('REQ-6: when the Sonos login fails the caller gets 502 sonos-login-failed', async () => {
  const { check, sign } = await tenantKeys();
  const { session } = stubSession(async () => {
    throw new SonosLoginError('Okta answered MFA_REQUIRED');
  });
  const handler = createSonosSessionHandler(() => session, check);
  const res = await handler(sonosRequest(bearer(await sign())), fakeContext().ctx);
  assert.equal(res.status, 502, 'Expected 502 when Sonos cannot produce a session');
  assert.deepEqual(res.jsonBody, { error: 'sonos-login-failed' }, 'Expected exactly { error: "sonos-login-failed" } and no detail of why');
});

// ── end to end: handler + real session logic + fake Sonos ─────────────────────

// Ten colleagues' apps ask at once (REQ-4): ten 200s, the same token, one Sonos login.
test('REQ-4: ten concurrent authenticated requests get the same token from one Sonos login', async () => {
  const { check, sign } = await tenantKeys();
  const sonos = createFakeSonos();
  const session = createSonosSession({ fetch: sonos.fetch, username: SONOS_USERNAME, password: SONOS_PASSWORD });
  const handler = createSonosSessionHandler(() => session, check);
  const jwt = await sign();
  const responses = await Promise.all(Array.from({ length: 10 }, () => handler(sonosRequest(bearer(jwt)), fakeContext().ctx)));
  assert.ok(responses.every((r) => r.status === 200), `Expected ten 200s, got ${responses.map((r) => r.status).join(',')}`);
  assert.equal(new Set(responses.map((r) => (r.jsonBody as Body).token)).size, 1, 'Expected one shared token');
  assert.equal(sonos.counts.sessionsIssued, 1, `Expected Sonos to see one login, it issued ${sonos.counts.sessionsIssued} sessions`);
  assert.equal(sonos.counts.loginAttempts, 1, `Expected Sonos to see one login attempt, it saw ${sonos.counts.loginAttempts}`);
});

// Sonos is rejecting the login (REQ-6): 502, the response and the logs never carry the password,
// and once Sonos recovers the very next request gets a 200.
test('REQ-6: a failing Sonos login is a 502 with no password in the response or logs, and the next request retries', async () => {
  const { check, sign } = await tenantKeys();
  const sonos = createFakeSonos();
  sonos.fault = 'mfa-required';
  sonos.echoCredentials = true; // Okta echoes the request back, password included
  const session = createSonosSession({ fetch: sonos.fetch, username: SONOS_USERNAME, password: SONOS_PASSWORD });
  const handler = createSonosSessionHandler(() => session, check);
  const jwt = await sign();

  const { ctx, logs } = recordingContext();
  const failed = await handler(sonosRequest(bearer(jwt)), ctx);
  assert.equal(failed.status, 502, 'Expected 502 when Okta answers MFA_REQUIRED');
  assert.deepEqual(failed.jsonBody, { error: 'sonos-login-failed' });
  assert.ok(!JSON.stringify(failed.jsonBody).includes(SONOS_PASSWORD), 'Expected the password to be absent from the response body');
  assert.ok(!logs.join('\n').includes(SONOS_PASSWORD), 'Expected the password to be absent from everything the handler logged');

  sonos.fault = null;
  const recovered = await handler(sonosRequest(bearer(jwt)), fakeContext().ctx);
  assert.equal(recovered.status, 200, 'Expected the next request to try the login again and succeed once Sonos is healthy');
  assert.equal(typeof (recovered.jsonBody as Body).token, 'string');
});

// Refresh through the whole stack (REQ-5): Sonos rejects the cached session, the caller gets a new token.
test('REQ-5: refresh=1 through the handler returns a new token when Sonos has rejected the cached one', async () => {
  const { check, sign } = await tenantKeys();
  const sonos = createFakeSonos();
  const session = createSonosSession({ fetch: sonos.fetch, username: SONOS_USERNAME, password: SONOS_PASSWORD });
  const handler = createSonosSessionHandler(() => session, check);
  const jwt = await sign();
  const first = (await handler(sonosRequest(bearer(jwt)), fakeContext().ctx)).jsonBody as Body;
  sonos.expireAllSessions();
  const refreshed = await handler(sonosRequest(bearer(jwt), 'refresh=1'), fakeContext().ctx);
  assert.equal(refreshed.status, 200);
  const token = (refreshed.jsonBody as Body).token;
  assert.notEqual(token, first.token, 'Expected a new token after Sonos rejected the cached one');
  assert.ok(token && sonos.isValid(token), 'Expected the returned token to be one Sonos accepts');
});

// Production wiring: SONOS_USERNAME and SONOS_PASSWORD are read from app settings, the session
// uses the global fetch, and ONE session is kept for the host so the login is reused across
// requests (REQ-4). globalThis.fetch is replaced by the fake here: nothing reaches Sonos.
test('REQ-4: getSonosSession() builds one session from SONOS_USERNAME and SONOS_PASSWORD and reuses its login', async () => {
  const sonos = createFakeSonos();
  const realFetch = globalThis.fetch;
  globalThis.fetch = sonos.fetch;
  try {
    await withEnv({ SONOS_USERNAME, SONOS_PASSWORD }, async () => {
      const session = getSonosSession();
      assert.equal(getSonosSession(), session, 'Expected every request on this host to share one session instance');
      const first = await session.get();
      const second = await getSonosSession().get();
      assert.equal(second, first, 'Expected the second request to reuse the first request\'s login');
      assert.equal(sonos.counts.sessionsIssued, 1, `Expected one Sonos login, Sonos issued ${sonos.counts.sessionsIssued} sessions`);
      assert.ok(sonos.isValid(first), 'Expected the service account from the app settings to have logged in');
    });
  } finally {
    globalThis.fetch = realFetch;
  }
});
