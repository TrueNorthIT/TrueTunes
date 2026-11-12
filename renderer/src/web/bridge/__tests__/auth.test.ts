// The logic createMsalAuth owns, against a fake MSAL client. The library itself is not tested here.
import { describe, it, expect, vi } from 'vitest';
import type { AccountInfo } from '@azure/msal-browser';
import { createMsalAuth, type MsalClient } from '../auth';

const CONFIG = { clientId: 'cid', tenantId: 'tid', redirectUri: 'https://app.test/' };
const SCOPES = ['openid', 'profile', 'email'];

function account(over: Partial<AccountInfo> = {}): AccountInfo {
  return {
    homeAccountId: 'h',
    environment: 'login.microsoftonline.com',
    tenantId: 'tid',
    localAccountId: 'l',
    username: 'ann@example.com',
    name: 'Ann Account',
    idTokenClaims: { oid: 'oid-ann', name: 'Ann Claim' },
    ...over,
  };
}

const minutes = (n: number) => Math.floor(Date.now() / 1000) + n * 60;

type Result = Awaited<ReturnType<MsalClient['acquireTokenSilent']>>;
const result = (over: Partial<Result> = {}): Result => ({
  idToken: 'id-1',
  accessToken: 'at-1',
  idTokenClaims: { exp: minutes(60) },
  ...over,
});

function fakeClient(over: Partial<MsalClient> = {}) {
  const calls: string[] = [];
  const client = {
    handleRedirectPromise: vi.fn(() => {
      calls.push('redirect');
      return Promise.resolve(null);
    }),
    getAllAccounts: vi.fn((): AccountInfo[] => {
      calls.push('accounts');
      return [];
    }),
    acquireTokenSilent: vi.fn(() => Promise.resolve(result())),
    loginRedirect: vi.fn(() => Promise.resolve()),
    clearCache: vi.fn(() => Promise.resolve()),
    ...over,
  } satisfies MsalClient;
  return { client, calls };
}

async function signedIn(over: Partial<MsalClient> = {}, acc = account()) {
  const f = fakeClient({ getAllAccounts: () => [acc], ...over });
  const auth = createMsalAuth(CONFIG, () => Promise.resolve(f.client));
  await auth.init();
  return { auth, client: f.client };
}

describe('init', () => {
  it('finishes a redirect before looking for an account, and answers null when there is none', async () => {
    const { client, calls } = fakeClient();
    const auth = createMsalAuth(CONFIG, () => Promise.resolve(client));
    expect(await auth.init()).toBeNull();
    expect(calls).toEqual(['redirect', 'accounts']);
    expect(auth.user()).toBeNull();
  });

  it('answers the user from the account\'s claims: oid, name, and the sign-in name as email', async () => {
    const { auth } = await signedIn();
    expect(auth.user()).toEqual({ oid: 'oid-ann', name: 'Ann Claim', email: 'ann@example.com' });
  });

  it('takes the account the redirect just signed in', async () => {
    const f = fakeClient({
      handleRedirectPromise: () => Promise.resolve({ account: account({ username: 'new@example.com' }) }),
      getAllAccounts: () => [account({ username: 'old@example.com' })],
    });
    const auth = createMsalAuth(CONFIG, () => Promise.resolve(f.client));
    expect((await auth.init())?.email).toBe('new@example.com');
  });

  it('falls back to sub when there is no oid, and to the account name when the claim has none', async () => {
    const { auth } = await signedIn({}, account({ idTokenClaims: { sub: 'sub-1' }, name: 'Account Name' }));
    expect(auth.user()).toEqual({ oid: 'sub-1', name: 'Account Name', email: 'ann@example.com' });
  });

  it('is not signed in when the token has neither oid nor sub', async () => {
    const f = fakeClient({ getAllAccounts: () => [account({ idTokenClaims: {} })] });
    const auth = createMsalAuth(CONFIG, () => Promise.resolve(f.client));
    expect(await auth.init()).toBeNull();
  });

  it('is not signed in when finishing the redirect fails', async () => {
    const f = fakeClient({ handleRedirectPromise: () => Promise.reject(new Error('AADSTS50000')) });
    const auth = createMsalAuth(CONFIG, () => Promise.resolve(f.client));
    expect(await auth.init()).toBeNull();
  });
});

describe('idToken', () => {
  it('asks silently for the sign-in scopes and returns the ID token', async () => {
    const { auth, client } = await signedIn();
    expect(await auth.idToken()).toBe('id-1');
    expect(client.acquireTokenSilent).toHaveBeenCalledTimes(1);
    expect(client.acquireTokenSilent).toHaveBeenCalledWith({ scopes: SCOPES, account: expect.objectContaining({ username: 'ann@example.com' }), forceRefresh: false });
  });

  it('refreshes once more when the ID token itself is within five minutes of expiry', async () => {
    const acquire = vi
      .fn<MsalClient['acquireTokenSilent']>()
      .mockResolvedValueOnce(result({ idToken: 'stale', idTokenClaims: { exp: minutes(4) } }))
      .mockResolvedValueOnce(result({ idToken: 'fresh' }));
    const { auth } = await signedIn({ acquireTokenSilent: acquire });
    expect(await auth.idToken()).toBe('fresh');
    expect(acquire).toHaveBeenCalledTimes(2);
    expect(acquire.mock.calls[1][0]).toMatchObject({ forceRefresh: true });
  });

  it('does not refresh a token with more than five minutes left', async () => {
    const acquire = vi.fn<MsalClient['acquireTokenSilent']>().mockResolvedValue(result({ idTokenClaims: { exp: minutes(6) } }));
    const { auth } = await signedIn({ acquireTokenSilent: acquire });
    await auth.idToken();
    expect(acquire).toHaveBeenCalledTimes(1);
  });

  it('refreshes when the claims carry no exp', async () => {
    const acquire = vi.fn<MsalClient['acquireTokenSilent']>().mockResolvedValue(result({ idTokenClaims: {} }));
    const { auth } = await signedIn({ acquireTokenSilent: acquire });
    await auth.idToken();
    expect(acquire).toHaveBeenCalledTimes(2);
  });

  it('forceRefresh goes straight to a forced refresh, once', async () => {
    const acquire = vi.fn<MsalClient['acquireTokenSilent']>().mockResolvedValue(result({ idToken: 'forced' }));
    const { auth } = await signedIn({ acquireTokenSilent: acquire });
    expect(await auth.idToken({ forceRefresh: true })).toBe('forced');
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(acquire.mock.calls[0][0]).toMatchObject({ forceRefresh: true });
  });

  it('is null on any failure, interaction required included', async () => {
    const { auth } = await signedIn({ acquireTokenSilent: () => Promise.reject(new Error('interaction_required')) });
    expect(await auth.idToken()).toBeNull();
  });

  it('is null when the second, forced, attempt fails', async () => {
    const acquire = vi
      .fn<MsalClient['acquireTokenSilent']>()
      .mockResolvedValueOnce(result({ idTokenClaims: { exp: minutes(1) } }))
      .mockRejectedValueOnce(new Error('expired'));
    const { auth } = await signedIn({ acquireTokenSilent: acquire });
    expect(await auth.idToken()).toBeNull();
  });

  it('is null with an empty token, with nobody signed in, and before init', async () => {
    const { auth } = await signedIn({ acquireTokenSilent: () => Promise.resolve(result({ idToken: '' })) });
    expect(await auth.idToken()).toBeNull();

    const f = fakeClient();
    const nobody = createMsalAuth(CONFIG, () => Promise.resolve(f.client));
    await nobody.init();
    expect(await nobody.idToken()).toBeNull();
    expect(f.client.acquireTokenSilent).not.toHaveBeenCalled();

    expect(await createMsalAuth(CONFIG, () => Promise.resolve(f.client)).idToken()).toBeNull();
  });
});

describe('graphToken', () => {
  it('is silent, for the scopes asked, and returns the access token', async () => {
    const acquire = vi.fn<MsalClient['acquireTokenSilent']>().mockResolvedValue(result({ accessToken: 'graph-at' }));
    const { auth } = await signedIn({ acquireTokenSilent: acquire });
    expect(await auth.graphToken(['https://graph.microsoft.com/Presence.Read.All'])).toBe('graph-at');
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(acquire.mock.calls[0][0].scopes).toEqual(['https://graph.microsoft.com/Presence.Read.All']);
  });

  it('is null without consent (any failure), and never redirects', async () => {
    const { auth, client } = await signedIn({ acquireTokenSilent: () => Promise.reject(new Error('consent_required')) });
    expect(await auth.graphToken(['x'])).toBeNull();
    expect(client.loginRedirect).not.toHaveBeenCalled();
  });

  it('is null with nobody signed in', async () => {
    const f = fakeClient();
    const auth = createMsalAuth(CONFIG, () => Promise.resolve(f.client));
    await auth.init();
    expect(await auth.graphToken(['x'])).toBeNull();
  });
});

describe('signIn and signOut', () => {
  it('signIn redirects with the sign-in scopes', async () => {
    const f = fakeClient();
    const auth = createMsalAuth(CONFIG, () => Promise.resolve(f.client));
    await auth.init();
    await auth.signIn();
    expect(f.client.loginRedirect).toHaveBeenCalledWith({ scopes: SCOPES });
  });

  it('signIn can force the account picker', async () => {
    const f = fakeClient();
    const auth = createMsalAuth(CONFIG, () => Promise.resolve(f.client));
    await auth.init();
    await auth.signIn({ selectAccount: true });
    expect(f.client.loginRedirect).toHaveBeenCalledWith({ scopes: SCOPES, prompt: 'select_account' });
  });

  it('signOut clears each account from this browser without leaving the page', async () => {
    const accounts = [account(), account({ username: 'other@example.com' })];
    const { auth, client } = await signedIn({ getAllAccounts: () => accounts });
    await auth.signOut();
    expect(client.clearCache).toHaveBeenCalledTimes(2);
    expect(client.clearCache).toHaveBeenCalledWith({ account: accounts[0] });
    expect(auth.user()).toBeNull();
    expect(await auth.idToken()).toBeNull();
  });
});
