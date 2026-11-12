// Microsoft Entra ID sign-in, as the TrueTunes app registration (confidential web client).
// Only accounts in the TrueNorth tenant get through: the authority and the issuer check are tenant-specific.

import { decodeJwt } from 'jose';
import { env } from './env';

export const ENTRA_SCOPES = 'openid profile email offline_access';

const authority = () => `https://login.microsoftonline.com/${env.entraTenantId()}`;

export function entraAuthorizeUrl(p: {
  redirectUri: string;
  state: string;
  codeChallenge: string;
  nonce: string;
}): string {
  const url = new URL(`${authority()}/oauth2/v2.0/authorize`);
  url.search = new URLSearchParams({
    client_id: env.entraClientId(),
    response_type: 'code',
    response_mode: 'query',
    redirect_uri: p.redirectUri,
    scope: ENTRA_SCOPES,
    state: p.state,
    nonce: p.nonce,
    code_challenge: p.codeChallenge,
    code_challenge_method: 'S256',
  }).toString();
  return url.toString();
}

export interface EntraTokens {
  id_token: string;
  refresh_token?: string;
}

async function tokenRequest(params: Record<string, string>): Promise<EntraTokens> {
  const res = await fetch(`${authority()}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.entraClientId(),
      client_secret: env.entraClientSecret(),
      scope: ENTRA_SCOPES,
      ...params,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json()) as EntraTokens & { error?: string; error_description?: string };
  if (!res.ok || !body.id_token) {
    throw new Error(
      `Entra token request failed: ${body.error ?? res.status} ${body.error_description?.split('\r\n')[0] ?? ''}`
    );
  }
  return body;
}

export const entraRedeem = (p: { code: string; redirectUri: string; codeVerifier: string }) =>
  tokenRequest({
    grant_type: 'authorization_code',
    code: p.code,
    redirect_uri: p.redirectUri,
    code_verifier: p.codeVerifier,
  });

export const entraRefresh = (refreshToken: string) =>
  tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });

export interface EntraUser {
  oid: string;
  name: string;
  email: string;
  exp: number;
}

/**
 * Reads an ID token we just received from Entra's token endpoint (never one handed to us by a client).
 * It came over TLS straight from login.microsoftonline.com in exchange for our client secret, so per
 * OIDC Core §3.1.3.7 that connection stands in for the signature check; fetching the JWKS for it
 * timed out on Vercel. We still check the tenant issuer, audience (the TrueTunes app), expiry and,
 * at sign-in, the nonce.
 */
export async function verifyEntraIdToken(idToken: string, nonce?: string): Promise<EntraUser> {
  const payload = decodeJwt(idToken);
  if (payload.iss !== `${authority()}/v2.0` || payload['tid'] !== env.entraTenantId()) {
    throw new Error('Entra ID token is from another tenant');
  }
  if (payload.aud !== env.entraClientId()) throw new Error('Entra ID token is for another app');
  if (!payload.exp || payload.exp * 1000 < Date.now() - 60_000) throw new Error('Entra ID token has expired');
  if (nonce !== undefined && payload['nonce'] !== nonce) throw new Error('Entra ID token nonce mismatch');
  const oid = payload['oid'];
  if (typeof oid !== 'string' || !oid) throw new Error('Entra ID token has no oid');
  const email = String(payload['email'] ?? payload['preferred_username'] ?? '');
  return { oid, name: String(payload['name'] ?? email), email, exp: payload.exp ?? 0 };
}
