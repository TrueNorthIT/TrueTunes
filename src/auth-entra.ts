import { PublicClientApplication } from '@azure/msal-node';
import type { SilentFlowRequest, InteractiveRequest } from '@azure/msal-node';
import { shell } from 'electron';
import * as fs from 'fs/promises';

export interface EntraUser {
  oid: string;
  name: string;
  email: string;
}

const SCOPES = ['openid', 'profile', 'email'];

export class EntraAuth {
  private msalApp: PublicClientApplication;
  private cacheFile: string;

  constructor(clientId: string, tenantId: string, cacheFile: string) {
    this.cacheFile = cacheFile;
    this.msalApp = new PublicClientApplication({
      auth: {
        clientId,
        authority: `https://login.microsoftonline.com/${tenantId}`,
      },
      cache: {
        cachePlugin: {
          beforeCacheAccess: async (ctx) => {
            try {
              const data = await fs.readFile(cacheFile, 'utf8');
              ctx.tokenCache.deserialize(data);
            } catch { /* no cache file yet */ }
          },
          afterCacheAccess: async (ctx) => {
            if (ctx.cacheHasChanged) {
              await fs.writeFile(cacheFile, ctx.tokenCache.serialize(), 'utf8');
            }
          },
        },
      },
    });
  }

  async acquireTokenSilent(): Promise<EntraUser | null> {
    const accounts = await this.msalApp.getTokenCache().getAllAccounts();
    if (accounts.length === 0) return null;
    try {
      const req: SilentFlowRequest = { scopes: SCOPES, account: accounts[0] };
      const result = await this.msalApp.acquireTokenSilent(req);
      return this.extractUser(result);
    } catch {
      return null;
    }
  }

  async acquireTokenInteractive(prompt?: string): Promise<EntraUser> {
    // Open the system browser (Edge on Windows — enrolled/compliant for CA policies)
    // rather than an Electron BrowserWindow which has no device compliance context.
    // MSAL-node starts a loopback server and handles the redirect automatically.
    const req: InteractiveRequest = {
      scopes: SCOPES,
      openBrowser: async (url: string) => { await shell.openExternal(url); },
      successTemplate: '<h1>Signed in to TrueTunes!</h1><p>You can close this tab and return to the app.</p>',
      errorTemplate: '<h1>Sign-in failed</h1><p>{errorMessage}</p><p>You can close this tab.</p>',
      ...(prompt ? { prompt } : {}),
    };
    const result = await this.msalApp.acquireTokenInteractive(req);
    return this.extractUser(result);
  }

  async signOut(): Promise<void> {
    const accounts = await this.msalApp.getTokenCache().getAllAccounts();
    for (const account of accounts) {
      await this.msalApp.getTokenCache().removeAccount(account);
    }
    try { await fs.unlink(this.cacheFile); } catch { /* ignore */ }
  }

  private extractUser(result: import('@azure/msal-node').AuthenticationResult | null): EntraUser {
    if (!result) throw new Error('MSAL returned null result');
    const claims = result.idTokenClaims as Record<string, unknown> | undefined;
    const oid = ((claims?.oid ?? claims?.sub) as string | undefined) ?? '';
    const name = ((claims?.name ?? result.account?.name) as string | undefined) ?? '';
    const email = (result.account?.username ?? (claims?.email ?? claims?.preferred_username) as string | undefined) ?? '';
    if (!oid) throw new Error('Entra token missing oid claim');
    return { oid, name, email };
  }
}
