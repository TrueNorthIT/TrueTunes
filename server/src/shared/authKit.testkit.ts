// Test helpers for the Entra token checks: a tenant key pair generated per test (no network),
// a signer, and fake requests and contexts.
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK } from 'jose';
import type { HttpRequest, InvocationContext } from '@azure/functions';
import type { EntraTokenCheck } from './auth';

export const TENANT = '11111111-1111-1111-1111-111111111111';
export const CLIENT = '22222222-2222-2222-2222-222222222222';
export const ISSUER = `https://login.microsoftonline.com/${TENANT}/v2.0`;
export const OID = '33333333-3333-3333-3333-333333333333';

type Key = Awaited<ReturnType<typeof keyPair>>;

async function keyPair(kid: string) {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' };
  return { privateKey, jwk };
}

export async function tenantKeys() {
  const good = await keyPair('good');
  const rogue = await keyPair('rogue');
  const check: EntraTokenCheck = { issuer: ISSUER, audience: CLIENT, keys: createLocalJWKSet({ keys: [good.jwk] }) };
  const sign = (
    claims: Record<string, unknown> = { oid: OID },
    opts: { key?: Key; iss?: string; aud?: string; exp?: number | string; kid?: string } = {}
  ) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: opts.kid ?? (opts.key ?? good).jwk.kid })
      .setIssuer(opts.iss ?? ISSUER)
      .setAudience(opts.aud ?? CLIENT)
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? '1h')
      .sign((opts.key ?? good).privateKey);
  return { check, sign, good, rogue };
}

export function fakeRequest(authorization?: string): HttpRequest {
  const headers = new Headers(authorization ? { authorization } : {});
  return { headers, method: 'POST', url: 'https://fn.example/api/profile/rename' } as unknown as HttpRequest;
}

export function fakeContext() {
  const warnings: string[] = [];
  const ctx = {
    log: () => {},
    warn: (...a: unknown[]) => warnings.push(a.join(' ')),
    error: (...a: unknown[]) => warnings.push(a.join(' ')),
  } as unknown as InvocationContext;
  return { ctx, warnings };
}
