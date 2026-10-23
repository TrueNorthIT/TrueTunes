// Who is calling: the Entra ID token the desktop app sends as `Authorization: Bearer …`.
//
// The token is the app's own Entra ID token (audience = the app registration's client id),
// so the server needs no exposed API scope. Signature against the tenant's published keys,
// issuer (this tenant, v2.0), audience and expiry are all checked, and the caller is the
// token's `oid`, never an oid or name from the request body.
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

export interface EntraTokenCheck {
  issuer: string;
  audience: string;
  keys: JWTVerifyGetKey;
}

let tenantCheck: EntraTokenCheck | undefined;

/** The check for this tenant and app, from ENTRA_TENANT_ID / ENTRA_CLIENT_ID; undefined until both are set. */
export function entraCheckFromEnv(): EntraTokenCheck | undefined {
  const tenantId = process.env['ENTRA_TENANT_ID'];
  const clientId = process.env['ENTRA_CLIENT_ID'];
  if (!tenantId || !clientId) return undefined;
  // createRemoteJWKSet caches the keys and refetches on an unknown kid (key rollover).
  tenantCheck ??= {
    issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`,
    audience: clientId,
    keys: createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`)),
  };
  return tenantCheck;
}

/** Verifies an Entra token (signature, issuer, audience, expiry) and returns its oid. Throws if anything is off. */
export async function verifyEntraToken(token: string, check: EntraTokenCheck): Promise<string> {
  const { payload } = await jwtVerify(token, check.keys, {
    issuer: check.issuer,
    audience: check.audience,
    algorithms: ['RS256'],
    requiredClaims: ['exp'],
    clockTolerance: 60,
  });
  if (typeof payload['oid'] !== 'string' || !payload['oid']) throw new Error('token has no oid claim');
  return payload['oid'];
}

export type AuthResult = { oid: string | null } | { response: HttpResponseInit };

const deny = (status: number, error: string): AuthResult => ({ response: { status, jsonBody: { error } } });

/**
 * A request with a token must carry a valid one, and its oid is the caller. A request
 * without one (the desktop clients released before tokens) gets `{ oid: null }`, so the
 * function falls back to the identity in the body, until AUTH_ENFORCE is 'true'.
 */
export async function authenticate(
  request: HttpRequest,
  context: InvocationContext,
  check: EntraTokenCheck | undefined = entraCheckFromEnv(),
  // ponytail: AUTH_ENFORCE is transitional. Once every client sends tokens, set it to 'true',
  // then delete this flag and the anonymous branches below.
  enforce: boolean = process.env['AUTH_ENFORCE'] === 'true'
): Promise<AuthResult> {
  const header = request.headers.get('authorization');
  const where = `${request.method} ${new URL(request.url).pathname}`;

  if (!header) {
    if (enforce) return deny(401, 'sign-in required');
    context.warn(`[auth] no token on ${where}: allowed while AUTH_ENFORCE is off`);
    return { oid: null };
  }

  const token = /^Bearer\s+(\S+)$/i.exec(header)?.[1];
  if (!token) return deny(401, 'malformed Authorization header');

  if (!check) {
    context.error('[auth] ENTRA_TENANT_ID / ENTRA_CLIENT_ID are not set, so tokens cannot be verified');
    return enforce ? deny(500, 'auth not configured') : { oid: null };
  }

  try {
    return { oid: await verifyEntraToken(token, check) };
  } catch (err) {
    context.warn(`[auth] rejected token on ${where}: ${err instanceof Error ? err.message : String(err)}`);
    return deny(401, 'invalid token');
  }
}

type Handler = (request: HttpRequest, context: InvocationContext) => Promise<HttpResponseInit>;

/** For handlers that write data but act as nobody in particular: they run only once `authenticate` lets the request in. */
export function requireAuth(handler: Handler): Handler {
  return async (request, context) => {
    const auth = await authenticate(request, context);
    return 'response' in auth ? auth.response : handler(request, context);
  };
}
