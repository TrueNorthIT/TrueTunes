// Who is asking: the Entra identity carried in our access token, their TrueTunes leaderboard name,
// and a fresh Entra ID token to present to the TrueTunes Functions when crediting their picks.

import type { AuthInfo } from '@modelcontextprotocol/server';
import { seal, unseal } from './crypto';
import { entraRefresh, verifyEntraIdToken } from './entra';
import { grantEntraRefresh, saveGrantEntraRefresh } from './oauth/server';
import { kv } from './store';
import { lookupDisplayName } from './truetunes';

export interface Caller {
  oid: string;
  name: string;
  email: string;
  gid: string;
}

export function callerFrom(auth?: AuthInfo): Caller {
  const x = auth?.extra as Partial<Caller> | undefined;
  if (!x?.oid || !x.gid) throw new Error('Not signed in');
  return { oid: x.oid, name: x.name ?? '', email: x.email ?? '', gid: x.gid };
}

/** Their claimed TrueTunes name (what the leaderboard shows), else their Entra name. Cached for an hour. */
export async function displayName(c: Caller): Promise<string> {
  const key = `tt:name:${c.oid}`;
  const cached = await kv().get<string>(key);
  if (cached) return cached;
  let name: string | null = null;
  try {
    name = await lookupDisplayName(c.oid);
  } catch (err) {
    console.warn('[identity] profile lookup failed:', err);
  }
  const resolved = name || c.name || c.email;
  if (name) await kv().set(key, resolved, { ex: 60 * 60 });
  return resolved;
}

export async function cacheIdToken(gid: string, idToken: string, exp: number): Promise<void> {
  const ttl = exp - Math.floor(Date.now() / 1000) - 300;
  if (ttl > 60) await kv().set(`idt:${gid}`, await seal(idToken), { ex: ttl });
}

/** An unexpired Entra ID token for this person (audience: the TrueTunes app), refreshed when needed. */
export async function entraIdToken(c: Caller): Promise<string | undefined> {
  const cached = await kv().get<string>(`idt:${c.gid}`);
  if (cached) return unseal(cached);
  const refresh = await grantEntraRefresh(c.gid);
  if (!refresh) return undefined;
  const tokens = await entraRefresh(refresh);
  if (tokens.refresh_token) await saveGrantEntraRefresh(c.gid, tokens.refresh_token);
  const who = await verifyEntraIdToken(tokens.id_token);
  await cacheIdToken(c.gid, tokens.id_token, who.exp);
  return tokens.id_token;
}
