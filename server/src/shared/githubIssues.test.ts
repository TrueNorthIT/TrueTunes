// Run: npm test (from server/). Fake fetch and clock, a throwaway RSA key.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey, createVerify, generateKeyPairSync } from 'node:crypto';
import {
  buildIssueBody,
  createGithubIssuer,
  githubAppConfigFromEnv,
  GithubError,
  isGithubLogin,
  mintAppJwt,
  type GithubAppConfig,
} from './githubIssues';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const config: GithubAppConfig = { appId: '12345', installationId: '678', privateKey };
const T0 = Date.parse('2026-11-12T12:00:00Z');
const HOUR = 3_600_000;

interface Call {
  url: string;
  method?: string;
  auth: string;
  body: Record<string, unknown> | null;
}

/** A fake GitHub: token mints and issue posts are answered from queues, every call is recorded. */
function fakeGithub(opts: { issueStatuses?: number[]; tokenStatus?: number; mintDelay?: boolean } = {}) {
  const calls: Call[] = [];
  const statuses = [...(opts.issueStatuses ?? [])];
  let mints = 0;
  const fetchFn = (async (url: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    calls.push({
      url,
      method: init.method,
      auth: headers['Authorization'],
      body: init.body ? JSON.parse(init.body as string) : null,
    });
    if (url.includes('/access_tokens')) {
      mints++;
      if (opts.mintDelay) await new Promise((r) => setTimeout(r, 5));
      const status = opts.tokenStatus ?? 201;
      return new Response(
        status === 201
          ? JSON.stringify({ token: `inst-token-${mints}`, expires_at: new Date(T0 + HOUR).toISOString() })
          : 'nope',
        { status }
      );
    }
    const status = statuses.shift() ?? 201;
    return new Response(status === 201 ? JSON.stringify({ html_url: 'https://github.com/o/r/issues/1' }) : 'bad', {
      status,
    });
  }) as unknown as typeof fetch;
  return { calls, fetchFn, mints: () => mints };
}

const issue = { title: 't', body: 'b', labels: ['bug'] };

test('FB-1: the JWT is RS256, verifies against the public key and carries iss, iat and a short exp', () => {
  const jwt = mintAppJwt(config, T0);
  const [h, p, s] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url').toString()), { alg: 'RS256', typ: 'JWT' });
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  assert.equal(claims.iss, '12345');
  assert.equal(claims.iat, T0 / 1000 - 60, 'issued in the past for clock drift');
  assert.ok(claims.exp - T0 / 1000 <= 600, 'GitHub allows at most 10 minutes');
  assert.ok(claims.exp > T0 / 1000);
  const ok = createVerify('RSA-SHA256')
    .update(`${h}.${p}`)
    .verify(createPublicKey(publicKey), Buffer.from(s, 'base64url'));
  assert.ok(ok, 'Expected the signature to verify');
});

test('FB-1: the issue is created with an installation token minted using that JWT', async () => {
  const gh = fakeGithub();
  const issuer = createGithubIssuer(config, 'o/r', { fetch: gh.fetchFn, now: () => T0 });
  const res = await issuer.createIssue(issue);
  assert.equal(res.html_url, 'https://github.com/o/r/issues/1');
  assert.equal(gh.calls[0].url, 'https://api.github.com/app/installations/678/access_tokens');
  assert.equal(gh.calls[0].method, 'POST');
  assert.match(gh.calls[0].auth, /^Bearer ey[\w-]+\.[\w-]+\.[\w-]+$/, 'Expected a JWT bearer');
  assert.equal(gh.calls[1].url, 'https://api.github.com/repos/o/r/issues');
  assert.equal(gh.calls[1].auth, 'Bearer inst-token-1');
});

test('FB-1: the token is cached until shortly before expiry, then re-minted', async () => {
  const gh = fakeGithub();
  let now = T0;
  const issuer = createGithubIssuer(config, 'o/r', { fetch: gh.fetchFn, now: () => now });
  await issuer.createIssue(issue);
  now = T0 + HOUR - 6 * 60_000;
  await issuer.createIssue(issue);
  assert.equal(gh.mints(), 1, 'Expected the cached token to be reused');
  now = T0 + HOUR - 4 * 60_000;
  await issuer.createIssue(issue);
  assert.equal(gh.mints(), 2, 'Expected a fresh mint inside the refresh margin');
  assert.equal(gh.calls.at(-1)?.auth, 'Bearer inst-token-2');
});

test('FB-1: concurrent requests share one mint', async () => {
  const gh = fakeGithub({ mintDelay: true });
  const issuer = createGithubIssuer(config, 'o/r', { fetch: gh.fetchFn, now: () => T0 });
  await Promise.all([issuer.createIssue(issue), issuer.createIssue(issue), issuer.createIssue(issue)]);
  assert.equal(gh.mints(), 1);
});

test('FB-1: a failed mint is not cached and surfaces as a status-only error', async () => {
  const gh = fakeGithub({ tokenStatus: 401 });
  const issuer = createGithubIssuer(config, 'o/r', { fetch: gh.fetchFn, now: () => T0 });
  await assert.rejects(issuer.createIssue(issue), (e: unknown) => e instanceof GithubError && e.status === 401);
  await assert.rejects(issuer.createIssue(issue));
  assert.equal(gh.mints(), 2, 'Expected the failure to be retried, not cached');
});

test('FB-2: a known username is assigned', async () => {
  const gh = fakeGithub();
  await createGithubIssuer(config, 'o/r', { fetch: gh.fetchFn, now: () => T0 }).createIssue({
    ...issue,
    assignee: 'joe-pitts',
  });
  assert.deepEqual(gh.calls[1].body?.['assignees'], ['joe-pitts']);
});

test('FB-2: a 422 retries once without the assignee and succeeds', async () => {
  const gh = fakeGithub({ issueStatuses: [422, 201] });
  const res = await createGithubIssuer(config, 'o/r', { fetch: gh.fetchFn, now: () => T0 }).createIssue({
    ...issue,
    assignee: 'joe',
    body: 'hello @joe',
  });
  assert.equal(res.html_url, 'https://github.com/o/r/issues/1');
  const posts = gh.calls.filter((c) => c.url.endsWith('/issues'));
  assert.equal(posts.length, 2);
  assert.ok(!('assignees' in (posts[1].body ?? {})), 'Expected no assignee on the retry');
  assert.equal(posts[1].body?.['body'], 'hello @joe', 'Expected the mention to stay');
});

test('FB-2: a 422 with no assignee is not retried; other failures are not retried', async () => {
  for (const [statuses, assignee, status] of [
    [[422], null, 422],
    [[500], 'joe', 500],
  ] as const) {
    const gh = fakeGithub({ issueStatuses: [...statuses] });
    const issuer = createGithubIssuer(config, 'o/r', { fetch: gh.fetchFn, now: () => T0 });
    await assert.rejects(
      issuer.createIssue({ ...issue, assignee }),
      (e: unknown) => e instanceof GithubError && e.status === status && e.step === 'issue creation'
    );
    assert.equal(gh.calls.filter((c) => c.url.endsWith('/issues')).length, 1);
  }
});

test('FB-3: no username means no assignee and the name-only footer', async () => {
  const gh = fakeGithub();
  await createGithubIssuer(config, 'o/r', { fetch: gh.fetchFn, now: () => T0 }).createIssue(issue);
  assert.ok(!('assignees' in (gh.calls[1].body ?? {})));
  assert.equal(buildIssueBody('desc', 'Joe', null), 'desc\n\n---\n**Raised by:** Joe');
  assert.equal(buildIssueBody('', null, null), '');
});

test('FB-2: the body mentions the username', () => {
  assert.equal(buildIssueBody('desc', 'Joe', 'joe-p'), 'desc\n\n---\n**Raised by:** Joe @joe-p');
  assert.equal(buildIssueBody('', null, 'joe-p'), '---\n**Raised by:** @joe-p');
});

test('FB-5: usernames follow GitHub rules, and anything else is never assigned', async () => {
  for (const ok of ['a', 'Joe-Pitts', 'a1-b2', 'x'.repeat(39)]) assert.ok(isGithubLogin(ok), ok);
  for (const bad of [
    '',
    '-a',
    'a-',
    'a--b',
    'x'.repeat(40),
    'a b',
    'a\n@evil',
    'a,b',
    'a_b',
    '@a',
    42,
    null,
    undefined,
  ]) {
    assert.ok(!isGithubLogin(bad), String(bad));
  }
  const gh = fakeGithub();
  await createGithubIssuer(config, 'o/r', { fetch: gh.fetchFn, now: () => T0 }).createIssue({
    ...issue,
    assignee: 'a\n@evil',
  });
  assert.ok(!('assignees' in (gh.calls[1].body ?? {})));
});

test('FB-4: errors and calls leak neither the key nor the tokens', async () => {
  const gh = fakeGithub({ issueStatuses: [500] });
  const issuer = createGithubIssuer(config, 'o/r', { fetch: gh.fetchFn, now: () => T0 });
  await assert.rejects(issuer.createIssue(issue), (e: unknown) => {
    const text = String((e as Error).message) + String((e as Error).stack);
    assert.ok(!text.includes('PRIVATE KEY') && !text.includes('inst-token'), 'Expected a status-only error');
    return true;
  });
  const bad = createGithubIssuer({ ...config, privateKey: 'not a key' }, 'o/r', { fetch: gh.fetchFn, now: () => T0 });
  await assert.rejects(bad.createIssue(issue), (e: unknown) => {
    assert.ok(!(e as Error).message.includes('not a key'));
    return true;
  });
});

test('config needs all three settings and normalises literal \\n in the key', () => {
  assert.equal(githubAppConfigFromEnv({ GITHUB_APP_ID: '1', GITHUB_APP_INSTALLATION_ID: '2' }), null);
  assert.equal(githubAppConfigFromEnv({ GITHUB_ISSUES_TOKEN: 'old' }), null, 'Expected no fallback to the old token');
  const flat = privateKey.trim().replace(/\n/g, '\\n');
  const c = githubAppConfigFromEnv({
    GITHUB_APP_ID: '1',
    GITHUB_APP_INSTALLATION_ID: '2',
    GITHUB_APP_PRIVATE_KEY: flat,
  });
  assert.equal(c?.privateKey, privateKey.trim());
  assert.ok(c && mintAppJwt(c, T0), 'Expected the normalised key to sign');
});
