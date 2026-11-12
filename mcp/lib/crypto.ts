import { createHash, randomBytes } from 'node:crypto';
import { CompactEncrypt, SignJWT, compactDecrypt, jwtVerify } from 'jose';
import { env } from './env';

/** A separate 256-bit key per purpose, derived from TOKEN_SECRET. */
function key(purpose: 'seal' | 'sign'): Uint8Array {
  return new Uint8Array(createHash('sha256').update(`truetunes-mcp:${purpose}:${env.tokenSecret()}`).digest());
}

/** Encrypts a secret before it goes into Redis. */
export async function seal(plaintext: string): Promise<string> {
  return new CompactEncrypt(new TextEncoder().encode(plaintext))
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .encrypt(key('seal'));
}

export async function unseal(sealed: string): Promise<string> {
  const { plaintext } = await compactDecrypt(sealed, key('seal'));
  return new TextDecoder().decode(plaintext);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

export interface AccessClaims {
  sub: string; // Entra oid
  name: string;
  email: string;
  gid: string; // grant id
  client_id: string;
  scope: string;
}

export async function signAccessToken(
  claims: AccessClaims,
  { issuer, audience, ttlSeconds }: { issuer: string; audience: string; ttlSeconds: number }
): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'HS256', typ: 'at+jwt' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(key('sign'));
}

export async function verifyAccessToken(
  token: string,
  { issuer, audience }: { issuer: string; audience: string }
): Promise<AccessClaims & { exp: number }> {
  const { payload } = await jwtVerify(token, key('sign'), {
    issuer,
    audience,
    algorithms: ['HS256'],
    typ: 'at+jwt',
    requiredClaims: ['exp', 'sub', 'gid'],
  });
  return payload as unknown as AccessClaims & { exp: number };
}
