// Entra ID sign-in (MSAL), the Functions calls that act as the user, and their IPC.

import { app, ipcMain } from 'electron';
import * as path from 'path';
import { EntraAuth, PRESENCE_SCOPE } from '../auth-entra';
import type { EntraUser } from '../auth-entra';
import { fetchPresences, resolveRoster } from '../graph-presence';
import * as telemetry from '../telemetry';
import { config, log, broadcastToRenderers, saveConfig, PUBSUB_FUNCTION_URL } from '../state';

// ─── Name claim ──────────────────────────────────────────────────────────────

/** Returns true if the name is already owned by a different Entra OID. */
export async function claimDisplayName(oid: string, displayName: string): Promise<boolean> {
  try {
    const res = await fnFetch(`${PUBSUB_FUNCTION_URL}/api/profile/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oid, displayName }),
    });
    return res.status === 409;
  } catch {
    return false; // network failure → allow gracefully
  }
}

/** Returns the display name linked to this OID in Cosmos, or null if none. */
async function lookupProfileByOid(oid: string): Promise<string | null> {
  try {
    const res = await fetch(`${PUBSUB_FUNCTION_URL}/api/profile/lookup?oid=${encodeURIComponent(oid)}`);
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const data = (await res.json()) as { displayName?: string };
    return data.displayName ?? null;
  } catch {
    return null;
  }
}

// ─── Entra auth ───────────────────────────────────────────────────────────────

let entraAuth: EntraAuth | null = null;

/** The signed-in user's Entra ID token, or null before sign-in (or when Entra isn't configured). */
export const entraIdToken = async (): Promise<string | null> => (entraAuth ? entraAuth.idToken() : null);

/**
 * fetch for the True Tunes functions that write or act as the user: adds the Entra ID
 * token, so the server takes the caller from it rather than from the body.
 */
export async function fnFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await entraIdToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...init, headers });
}

export async function ensureEntraAuth(forcePrompt?: string): Promise<void> {
  // Lazy-init so env vars are guaranteed to be loaded (dotenv + build-env.json
  // run during app startup, before this function is ever called).
  if (!entraAuth) {
    const clientId = process.env['ENTRA_CLIENT_ID'];
    const tenantId = process.env['ENTRA_TENANT_ID'];
    if (!clientId || !tenantId) {
      console.warn('[entra] ENTRA_CLIENT_ID / ENTRA_TENANT_ID not set — skipping Entra auth');
      return;
    }
    const cacheFile = path.join(app.getPath('userData'), 'msal-cache.json');
    entraAuth = new EntraAuth(clientId, tenantId, cacheFile);
  }

  let user: EntraUser | null = forcePrompt ? null : await entraAuth.acquireTokenSilent();
  if (!user) {
    user = await entraAuth.acquireTokenInteractive(forcePrompt);
  }

  config.entraOid = user.oid;
  config.entraName = user.name;
  config.entraEmail = user.email;

  if (!config.displayName) {
    // No local display name — check Cosmos for an existing profile tied to this OID.
    const existing = await lookupProfileByOid(user.oid);
    config.displayName = existing ?? user.name;
  }

  // Register this display name under this OID (no-op if already claimed; migrates pre-Entra users).
  // Awaited: the functions resolve a token's caller through this claim, so it must land before the
  // first write (pubsub connect follows this).
  await claimDisplayName(user.oid, config.displayName);

  await saveConfig();

  telemetry.setContext({ userId: config.displayName });
  log('[entra] Authenticated as', user.email, '→', config.displayName);
  broadcastToRenderers('auth:entra-ready', user);
}

export function register(): void {
  ipcMain.handle('auth:getEntraUser', (): EntraUser | null => {
    if (!config.entraOid) return null;
    return { oid: config.entraOid, name: config.entraName ?? '', email: config.entraEmail ?? '' };
  });

  ipcMain.handle('auth:entraSignOut', async () => {
    await entraAuth?.signOut();
    config.entraOid = undefined;
    config.entraName = undefined;
    config.entraEmail = undefined;
    config.displayName = undefined;
    await saveConfig();
  });

  ipcMain.handle('auth:entraReLogin', async () => {
    try {
      await ensureEntraAuth('select_account');
    } catch (err) {
      console.error('[entra] Re-login failed:', err);
    }
  });

  ipcMain.handle('presence:office', async () => {
    try {
      if (!entraAuth) return { inOffice: [], basis: 'none', detail: [], error: 'not signed in' };

      const token = await entraAuth.acquireGraphToken([PRESENCE_SCOPE]);
      // No consent yet (or the scope isn't on the app registration) — the caller
      // falls back to inferring the room from recent queue activity.
      if (!token) return { inOffice: [], basis: 'none', detail: [], error: 'no presence consent' };

      const res = await fetch(`${PUBSUB_FUNCTION_URL}/api/users`);
      const users = (await res.json()) as Array<{ userId: string; entraOid?: string | null }>;
      const oidToName: Record<string, string> = {};
      for (const u of users) if (u.entraOid) oidToName[u.entraOid] = u.userId;

      const oids = Object.keys(oidToName);
      if (oids.length === 0) return { inOffice: [], basis: 'none', detail: [] };

      const presences = await fetchPresences(token, oids);
      return resolveRoster(presences, oidToName);
    } catch (err) {
      return { inOffice: [], basis: 'none', detail: [], error: String(err) };
    }
  });
}
