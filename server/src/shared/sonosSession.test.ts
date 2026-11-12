// Run: npm test (from server/).
//
// createSonosSession in server/src/shared/sonosSession.ts: the shared Sonos web session the
// server keeps for the office. It logs in to play.sonos.com headlessly with a service account
// (next-auth csrf + signin/okta -> Okta authorize page with an embedded stateToken -> POST
// /api/v1/authn -> follow the redirects to the next-auth callback and read the
// __Secure-next-auth.session-token cookie), caches the session, and checks it with
// GET https://play.sonos.com/api/mfe (2xx = Sonos still accepts it).
//
// Everything runs against the fake Sonos in sonosKit.testkit.ts: no network.
//
// Requirements covered here (the HTTP half is in sonosSessionHandler.test.ts):
//   REQ-4  The server reuses one Sonos login instead of logging in on every request.
//   REQ-5  With refresh the cached session is checked against Sonos: still accepted -> same
//          token, no new login; rejected -> log in again and return the new token.
//   REQ-6  When the Sonos login fails the caller gets an error, the failure is not cached and
//          the next request tries again. The password never appears in an error.
import test from 'node:test';
import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { createSonosSession, SonosLoginError } from './sonosSession';
import { SESSION_COOKIE, SONOS_PASSWORD, SONOS_USERNAME, createFakeSonos, type FakeSonos, type LoginFault } from './sonosKit.testkit';

const sessionFor = (sonos: FakeSonos, password = SONOS_PASSWORD) =>
  createSonosSession({ fetch: sonos.fetch, username: SONOS_USERNAME, password });

/** The error a promise rejects with; fails the test if it resolves. */
async function failureOf(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (err) {
    return err;
  }
  assert.fail('Expected the Sonos login to fail, but get() returned a token');
}

const tenOf = <T>(make: () => Promise<T>) => Promise.all(Array.from({ length: 10 }, make));

// ── REQ-4: one login, reused ──────────────────────────────────────────────────

// Given a fresh session and a Sonos that accepts the service account, `get()` performs the
// four-step login and resolves to the value of the __Secure-next-auth.session-token cookie.
test('REQ-4: the first request logs in to Sonos and returns the value of the session cookie', async () => {
  const sonos = createFakeSonos();
  const token = await sessionFor(sonos).get();
  assert.equal(sonos.counts.sessionsIssued, 1, 'Expected the login to end with Sonos issuing one session');
  assert.ok(sonos.isValid(token), `Expected get() to return the ${SESSION_COOKIE} cookie value Sonos issued, got "${token}"`);
  assert.equal(token, 'sonos-jwe-1.AbCdEf==', 'Expected the cookie value verbatim, including its trailing "=" characters');
});

// Okta embeds the stateToken as a JS string literal with "-" written \x2D. The authn request
// must carry the decoded token plus the service account's username and password, as JSON.
test('REQ-4: the login sends the service account and the decoded stateToken to Okta authn', async () => {
  const sonos = createFakeSonos();
  await sessionFor(sonos).get();
  const authn = sonos.requests.filter((r) => r.method === 'POST' && r.url.href === 'https://login.sonos.com/api/v1/authn');
  assert.equal(authn.length, 1, 'Expected exactly one POST to https://login.sonos.com/api/v1/authn');
  assert.match(authn[0].headers.get('content-type') ?? '', /application\/json/, 'Expected the authn body to be sent as JSON');
  assert.deepEqual(
    JSON.parse(authn[0].body),
    { username: SONOS_USERNAME, password: SONOS_PASSWORD, stateToken: 'state-token-1' },
    'Expected username, password and the stateToken with its \\x2D escapes decoded to "-"'
  );
});

// Ten requests one after another within a minute: Sonos sees one login, and every caller gets the same token.
test('REQ-4: ten requests in a row cause one Sonos login and all get the same token', async () => {
  const sonos = createFakeSonos();
  const session = sessionFor(sonos);
  const tokens: string[] = [];
  for (let i = 0; i < 10; i++) tokens.push(await session.get());
  assert.equal(sonos.counts.loginAttempts, 1, `Expected one login attempt for ten requests, Sonos saw ${sonos.counts.loginAttempts}`);
  assert.equal(sonos.counts.sessionsIssued, 1, `Expected one session issued, Sonos issued ${sonos.counts.sessionsIssued}`);
  assert.deepEqual(new Set(tokens).size, 1, 'Expected every request to receive the same cached token');
});

// Ten requests at the same moment, before any login has finished: still one login (in-flight logins are shared).
test('REQ-4: ten concurrent requests cause one Sonos login and all get the same token', async () => {
  const sonos = createFakeSonos();
  const session = sessionFor(sonos);
  const tokens = await tenOf(() => session.get());
  assert.equal(sonos.counts.loginAttempts, 1, `Expected one login attempt for ten concurrent requests, Sonos saw ${sonos.counts.loginAttempts}`);
  assert.equal(sonos.counts.sessionsIssued, 1, `Expected one session issued, Sonos issued ${sonos.counts.sessionsIssued}`);
  assert.deepEqual(new Set(tokens).size, 1, 'Expected every concurrent request to receive the same token');
});

// A plain get() serves the cached token without calling Sonos at all (validation is what refresh is for).
test('REQ-4: once logged in, a plain request makes no calls to Sonos', async () => {
  const sonos = createFakeSonos();
  const session = sessionFor(sonos);
  await session.get();
  const before = sonos.requests.length;
  await session.get();
  await session.get();
  assert.equal(sonos.requests.length, before, 'Expected no further requests to Sonos (not even /api/mfe) for a cached, non-refresh get()');
});

// ── REQ-5: refresh checks the cached session against Sonos ────────────────────

// Given a cached session Sonos still accepts, get({ refresh: true }) calls GET /api/mfe with the
// session cookie, sees a 2xx, and returns the same token without logging in again.
test('REQ-5: refresh with a session Sonos still accepts returns the same token with no new login', async () => {
  const sonos = createFakeSonos();
  const session = sessionFor(sonos);
  const first = await session.get();
  const second = await session.get({ refresh: true });
  assert.equal(second, first, 'Expected the same token back while Sonos still accepts it');
  assert.equal(sonos.counts.loginAttempts, 1, `Expected no new login on refresh, Sonos saw ${sonos.counts.loginAttempts} login attempts`);
  assert.equal(sonos.counts.mfeChecks, 1, 'Expected the cached session to be checked once with GET /api/mfe');
  const check = sonos.requests.find((r) => r.url.pathname === '/api/mfe');
  assert.ok(
    check?.headers.get('cookie')?.includes(`${SESSION_COOKIE}=${first}`),
    `Expected /api/mfe to be called with Cookie: ${SESSION_COOKIE}=<cached token>, got "${check?.headers.get('cookie')}"`
  );
});

// Given a cached session Sonos has stopped accepting (/api/mfe answers 401), refresh logs in
// again, returns the NEW token, and later plain requests use that new token.
test('REQ-5: refresh with a session Sonos rejects logs in again and returns the new token', async () => {
  const sonos = createFakeSonos();
  const session = sessionFor(sonos);
  const first = await session.get();
  sonos.expireAllSessions();
  const second = await session.get({ refresh: true });
  assert.notEqual(second, first, 'Expected a different token once Sonos rejected the cached one');
  assert.ok(sonos.isValid(second), 'Expected the returned token to be a session Sonos currently accepts');
  assert.equal(sonos.counts.sessionsIssued, 2, `Expected exactly one new login, Sonos issued ${sonos.counts.sessionsIssued} sessions in all`);
  const later = await session.get();
  assert.equal(later, second, 'Expected later plain requests to be served the new token');
  assert.equal(sonos.counts.sessionsIssued, 2, 'Expected no further login for the later plain request');
});

// Several colleagues' apps get a 401 from Sonos at the same moment and all ask for refresh: one re-login.
test('REQ-5: ten concurrent refreshes against a rejected session cause one new login', async () => {
  const sonos = createFakeSonos();
  const session = sessionFor(sonos);
  const first = await session.get();
  sonos.expireAllSessions();
  const tokens = await tenOf(() => session.get({ refresh: true }));
  assert.equal(sonos.counts.sessionsIssued, 2, `Expected one new login in all, Sonos issued ${sonos.counts.sessionsIssued} sessions`);
  assert.equal(new Set(tokens).size, 1, 'Expected every concurrent refresh to receive the same new token');
  assert.notEqual(tokens[0], first, 'Expected the new token, not the rejected one');
});

// With nothing cached there is nothing to check: refresh simply logs in.
test('REQ-5: refresh with no cached session logs in and returns the token', async () => {
  const sonos = createFakeSonos();
  const token = await sessionFor(sonos).get({ refresh: true });
  assert.equal(sonos.counts.sessionsIssued, 1, 'Expected one login when refreshing an empty cache');
  assert.ok(sonos.isValid(token), 'Expected the token Sonos issued');
});

// The rejected token must never be handed back as if it were fresh: when the re-login ends
// without a session cookie, the caller gets the login error (REQ-6), not the stale token.
test('REQ-5: a re-login that sets no session cookie fails instead of returning the rejected token', async () => {
  const sonos = createFakeSonos();
  const session = sessionFor(sonos);
  await session.get();
  sonos.expireAllSessions();
  sonos.fault = 'no-session-cookie';
  const err = await failureOf(session.get({ refresh: true }));
  assert.ok(err instanceof SonosLoginError, `Expected a SonosLoginError, got ${String(err)}`);
});

// ── REQ-6: a failed login is an error, is not cached, and is retried ──────────

const failures: Array<{ name: string; fault?: LoginFault; password?: string }> = [
  { name: 'Okta rejects the password', password: 'not-the-service-account-password' },
  { name: 'Okta answers MFA_REQUIRED instead of SUCCESS', fault: 'mfa-required' },
  { name: 'Okta answers LOCKED_OUT instead of SUCCESS', fault: 'locked-out' },
  { name: 'the login page has no stateToken', fault: 'no-state-token' },
  { name: 'the login ends without a session cookie', fault: 'no-session-cookie' },
  { name: 'play.sonos.com is unavailable at the start of the sign-in', fault: 'play-unavailable' },
];

for (const failure of failures) {
  // Given Sonos cannot produce a session for this reason, get() rejects with SonosLoginError
  // (the function turns that into 502 sonos-login-failed).
  test(`REQ-6: when ${failure.name}, get() rejects with a SonosLoginError`, async () => {
    const sonos = createFakeSonos();
    sonos.fault = failure.fault ?? null;
    const err = await failureOf(sessionFor(sonos, failure.password).get());
    assert.ok(err instanceof SonosLoginError, `Expected a SonosLoginError when ${failure.name}, got ${String(err)}`);
  });

  // The error text is safe to log and show: it never contains the password, even when
  // Sonos echoes the request back in its error body.
  test(`REQ-6: when ${failure.name}, the error does not contain the password`, async () => {
    const sonos = createFakeSonos();
    sonos.fault = failure.fault ?? null;
    sonos.echoCredentials = true;
    const password = failure.password ?? SONOS_PASSWORD;
    const err = await failureOf(sessionFor(sonos, failure.password).get());
    assert.ok(err instanceof Error, 'Expected an Error to be thrown');
    assert.ok(!err.message.includes(password), `Expected the password to be absent from the error message, got: ${err.message}`);
    assert.ok(!inspect(err, { depth: 8 }).includes(password), 'Expected the password to be absent from the whole error (stack, cause and properties)');
  });
}

// Okta never sees the credentials unless the login page gave us the transaction's stateToken.
test('REQ-6: when the login page has no stateToken, the credentials are not sent anywhere', async () => {
  const sonos = createFakeSonos();
  sonos.fault = 'no-state-token';
  await failureOf(sessionFor(sonos).get());
  assert.equal(sonos.counts.authnPosts, 0, 'Expected no POST to /api/v1/authn without a stateToken');
});

// The failure is not cached: once Sonos is healthy again, the very next request logs in and succeeds.
test('REQ-6: a failed login is not cached, so the next request tries again and can succeed', async () => {
  const sonos = createFakeSonos();
  const session = sessionFor(sonos);
  sonos.fault = 'mfa-required';
  await failureOf(session.get());
  const attemptsAfterFailure = sonos.counts.loginAttempts;
  sonos.fault = null;
  const token = await session.get();
  assert.ok(sonos.counts.loginAttempts > attemptsAfterFailure, 'Expected the next request to start a new login rather than replay the failure');
  assert.ok(sonos.isValid(token), 'Expected the retry to return the session Sonos issued');
});

// Callers waiting on the same failing login all see the failure (none hangs or gets a token),
// and the failure is still not remembered afterwards.
test('REQ-6: concurrent requests during a failing login all fail, and the next one retries', async () => {
  const sonos = createFakeSonos();
  const session = sessionFor(sonos);
  sonos.fault = 'locked-out';
  const results = await Promise.allSettled([session.get(), session.get(), session.get()]);
  for (const r of results) {
    assert.equal(r.status, 'rejected', 'Expected every caller of a failing login to be rejected');
    assert.ok(r.status === 'rejected' && r.reason instanceof SonosLoginError, 'Expected each rejection to be a SonosLoginError');
  }
  const attemptsAfterFailure = sonos.counts.loginAttempts;
  sonos.fault = null;
  const token = await session.get();
  assert.ok(sonos.counts.loginAttempts > attemptsAfterFailure, 'Expected a fresh login attempt after the failure');
  assert.ok(sonos.isValid(token), 'Expected the retry to succeed');
});

test('SonosLoginError is an Error named SonosLoginError', () => {
  const err = new SonosLoginError('nope');
  assert.ok(err instanceof Error, 'Expected SonosLoginError to extend Error');
  assert.equal(err.name, 'SonosLoginError', 'Expected the error name to identify it in logs');
  assert.equal(err.message, 'nope');
});
