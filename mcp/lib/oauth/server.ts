// The OAuth 2.1 authorization server MCP clients talk to. People sign in with Entra (see app/oauth/*);
// we then issue our own short-lived access tokens for /mcp and rotating refresh tokens.
// Clients identify themselves either by Dynamic Client Registration or by a Client ID Metadata Document.

import type { AuthInfo } from '@modelcontextprotocol/server';
import { randomToken, seal, sha256, signAccessToken, unseal, verifyAccessToken } from '../crypto';
import { publicOrigin } from '../env';
import { log } from '../log';
import { DAY, kv } from '../store';
import { isAllowedRedirectUri } from './validate';

export const SCOPE = 'truetunes';
const ACCESS_TTL = 60 * 60;
const REFRESH_TTL = 90 * DAY;

export const resourceUrl = (origin: string) => `${origin}/mcp`;

export function authServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [SCOPE],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
    service_documentation: origin,
  };
}

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, MCP-Protocol-Version',
};

export function oauthError(error: string, description: string, status = 400): Response {
  log.warn('oauth', 'error response', { error, description });
  return Response.json(
    { error, error_description: description },
    { status, headers: { ...CORS, 'Cache-Control': 'no-store' } }
  );
}

// ─── Clients ─────────────────────────────────────────────────────────────────

export interface ClientInfo {
  client_id: string;
  client_name?: string;
  redirect_uris: string[];
}

export async function registerClient(meta: Record<string, unknown>): Promise<Record<string, unknown>> {
  const redirectUris = meta['redirect_uris'];
  if (
    !Array.isArray(redirectUris) ||
    !redirectUris.length ||
    !redirectUris.every((u) => typeof u === 'string' && isAllowedRedirectUri(u))
  ) {
    throw Object.assign(new Error('redirect_uris must be https, loopback http, or an app scheme'), {
      code: 'invalid_redirect_uri',
    });
  }
  const client: ClientInfo = {
    client_id: `dcr_${randomToken(16)}`,
    client_name: typeof meta['client_name'] === 'string' ? meta['client_name'].slice(0, 100) : undefined,
    redirect_uris: redirectUris as string[],
  };
  await kv().set(`client:${client.client_id}`, client, { ex: 365 * DAY });
  log.info('oauth', 'client registered', { client: client.client_id, name: client.client_name });
  return {
    ...client,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
  };
}

/** A registered client, or a CIMD client whose metadata document we fetch (and cache) from its client_id URL. */
export async function resolveClient(clientId: string | null): Promise<ClientInfo | null> {
  if (!clientId) return null;
  if (!clientId.startsWith('https://')) return kv().get<ClientInfo>(`client:${clientId}`);

  const cacheKey = `cimd:${sha256(clientId)}`;
  const cached = await kv().get<ClientInfo>(cacheKey);
  if (cached) return cached;
  try {
    const url = new URL(clientId);
    if (url.pathname === '/' || url.hash) return null;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5_000),
      redirect: 'error',
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length > 20_000) return null;
    const doc = JSON.parse(text) as Record<string, unknown>;
    const uris = doc['redirect_uris'];
    if (
      doc['client_id'] !== clientId ||
      !Array.isArray(uris) ||
      !uris.every((u) => typeof u === 'string' && isAllowedRedirectUri(u))
    ) {
      return null;
    }
    const client: ClientInfo = {
      client_id: clientId,
      client_name: typeof doc['client_name'] === 'string' ? doc['client_name'] : undefined,
      redirect_uris: uris as string[],
    };
    await kv().set(cacheKey, client, { ex: 60 * 60 });
    return client;
  } catch {
    return null;
  }
}

// ─── Authorization flow state ────────────────────────────────────────────────

/** Between /oauth/authorize and Entra's callback (10 minutes). */
export interface PendingAuthorization {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  clientState?: string;
  resource?: string;
  entraVerifier: string;
  nonce: string;
}

/** Our authorization code, redeemed once at /oauth/token (5 minutes). */
export interface IssuedCode {
  gid: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
}

// ─── Grants and tokens ───────────────────────────────────────────────────────

/** One person's sign-in through one client. Holds their Entra refresh token, so we can credit them later. */
export interface Grant {
  oid: string;
  name: string;
  email: string;
  clientId: string;
  entraRefresh?: string; // sealed
  createdAt: number;
}

export async function createGrant(
  g: Omit<Grant, 'createdAt' | 'entraRefresh'> & { entraRefresh?: string }
): Promise<string> {
  const gid = randomToken(16);
  const grant: Grant = {
    ...g,
    entraRefresh: g.entraRefresh ? await seal(g.entraRefresh) : undefined,
    createdAt: Date.now(),
  };
  await kv().set(`grant:${gid}`, grant, { ex: REFRESH_TTL });
  return gid;
}

export const getGrant = (gid: string) => kv().get<Grant>(`grant:${gid}`);

export async function grantEntraRefresh(gid: string): Promise<string | null> {
  const g = await getGrant(gid);
  return g?.entraRefresh ? unseal(g.entraRefresh) : null;
}

export async function saveGrantEntraRefresh(gid: string, refreshToken: string): Promise<void> {
  const g = await getGrant(gid);
  if (g) await kv().set(`grant:${gid}`, { ...g, entraRefresh: await seal(refreshToken) }, { ex: REFRESH_TTL });
}

export async function issueTokens(origin: string, gid: string, grant: Grant, clientId: string) {
  const access_token = await signAccessToken(
    { sub: grant.oid, name: grant.name, email: grant.email, gid, client_id: clientId, scope: SCOPE },
    { issuer: origin, audience: resourceUrl(origin), ttlSeconds: ACCESS_TTL }
  );
  const refresh_token = randomToken(32);
  await kv().set(`rt:${sha256(refresh_token)}`, { gid, clientId }, { ex: REFRESH_TTL });
  // Keep the grant alive as long as its refresh token.
  await kv().expire(`grant:${gid}`, REFRESH_TTL);
  return { access_token, token_type: 'Bearer', expires_in: ACCESS_TTL, refresh_token, scope: SCOPE };
}

/** withMcpAuth's verifier for /mcp. */
export async function verifyBearer(req: Request, token?: string): Promise<AuthInfo | undefined> {
  if (!token) return undefined;
  const origin = publicOrigin(req);
  try {
    const c = await verifyAccessToken(token, { issuer: origin, audience: resourceUrl(origin) });
    return {
      token,
      clientId: c.client_id,
      scopes: c.scope.split(' '),
      expiresAt: c.exp,
      resource: new URL(resourceUrl(origin)),
      extra: { oid: c.sub, name: c.name, email: c.email, gid: c.gid },
    };
  } catch {
    return undefined;
  }
}
