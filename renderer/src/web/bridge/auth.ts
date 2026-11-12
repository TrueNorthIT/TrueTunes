// Entra sign-in for the browser on @azure/msal-browser: redirect flow only (never a popup), the cache in
// localStorage, the scopes of the desktop's auth-entra.ts. Everything that is ours is here; the library sits
// behind the small MsalClient interface so tests can fake it.

import { createStandardPublicClientApplication, type AccountInfo } from '@azure/msal-browser';
import type { WebAuth } from './types';

const SCOPES = ['openid', 'profile', 'email'];
/** An ID token this close to its own expiry is refreshed: MSAL's silent flow only looks at the access token's. */
const REFRESH_WITHIN_MS = 5 * 60_000;

/** The part of MSAL's PublicClientApplication this module uses. */
export interface MsalClient {
  handleRedirectPromise(): Promise<{ account: AccountInfo } | null>;
  getAllAccounts(): AccountInfo[];
  acquireTokenSilent(request: {
    scopes: string[];
    account: AccountInfo;
    forceRefresh?: boolean;
  }): Promise<{ idToken: string; accessToken: string; idTokenClaims?: object }>;
  loginRedirect(request: { scopes: string[]; prompt?: string }): Promise<void>;
  /** Clears the account and its tokens from this browser's cache, without navigating. */
  clearCache(request: { account: AccountInfo }): Promise<void>;
}

export function userOf(account: AccountInfo): EntraUser | null {
  const claims = account.idTokenClaims;
  const oid = claims?.oid ?? claims?.sub;
  if (!oid) return null;
  return {
    oid,
    name: claims?.name ?? account.name ?? '',
    email: account.username || claims?.preferred_username || '',
  };
}

function expiryMs(claims: object | undefined): number {
  const exp: unknown = claims ? Object.fromEntries(Object.entries(claims))['exp'] : undefined;
  return typeof exp === 'number' ? exp * 1000 : 0;
}

export function createMsalAuth(
  config: { clientId: string; tenantId: string; redirectUri: string },
  makeClient: () => Promise<MsalClient> = () =>
    createStandardPublicClientApplication({
      auth: {
        clientId: config.clientId,
        authority: `https://login.microsoftonline.com/${config.tenantId}`,
        redirectUri: config.redirectUri,
      },
      cache: { cacheLocation: 'localStorage' },
    })
): WebAuth {
  let clientPromise: Promise<MsalClient> | null = null;
  const getClient = () => (clientPromise ??= makeClient());
  let client: MsalClient | null = null;
  let account: AccountInfo | null = null;
  let current: EntraUser | null = null;

  return {
    async init() {
      client = await getClient();
      let redirected: { account: AccountInfo } | null = null;
      try {
        redirected = await client.handleRedirectPromise();
      } catch {
        /* a failed or cancelled redirect leaves nobody signed in, whatever the cache holds */
      }
      account = redirected?.account ?? client.getAllAccounts()[0] ?? null;
      current = account ? userOf(account) : null;
      return current;
    },

    async signIn(opts) {
      await (
        await getClient()
      ).loginRedirect({ scopes: SCOPES, ...(opts?.selectAccount ? { prompt: 'select_account' } : {}) });
    },

    async signOut() {
      const c = await getClient();
      for (const a of c.getAllAccounts()) await c.clearCache({ account: a });
      account = null;
      current = null;
    },

    user: () => current,

    async idToken(opts) {
      if (!client || !account) return null;
      try {
        const request = { scopes: SCOPES, account, forceRefresh: !!opts?.forceRefresh };
        let result = await client.acquireTokenSilent(request);
        if (!request.forceRefresh && expiryMs(result.idTokenClaims) - Date.now() < REFRESH_WITHIN_MS) {
          result = await client.acquireTokenSilent({ ...request, forceRefresh: true });
        }
        return result.idToken || null;
      } catch {
        return null; // interaction required, offline, expired: the app shows sign-in again
      }
    },

    async graphToken(scopes) {
      if (!client || !account) return null;
      try {
        return (await client.acquireTokenSilent({ scopes, account })).accessToken || null;
      } catch {
        return null;
      }
    },
  };
}
