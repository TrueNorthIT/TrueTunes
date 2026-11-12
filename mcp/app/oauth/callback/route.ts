import { randomToken, sha256 } from '@/lib/crypto';
import { entraRedeem, verifyEntraIdToken } from '@/lib/entra';
import { publicOrigin } from '@/lib/env';
import { cacheIdToken } from '@/lib/identity';
import { createGrant, type IssuedCode, type PendingAuthorization } from '@/lib/oauth/server';
import { errorText, log } from '@/lib/log';
import { kv } from '@/lib/store';
import { errorPage } from '@/lib/oauth/error-page';

/** Entra sends the person back here. We record who they are and hand the MCP client an authorization code. */
export async function GET(req: Request): Promise<Response> {
  const p = new URL(req.url).searchParams;
  const origin = publicOrigin(req);
  const pending = await kv().getdel<PendingAuthorization>(`authz:${p.get('state') ?? ''}`);
  if (!pending)
    return errorPage(
      400,
      'Sign-in expired',
      'This sign-in link has expired or was already used. Connect again from your chat app.'
    );

  const back = (params: Record<string, string>) => {
    const url = new URL(pending.redirectUri);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    if (pending.clientState) url.searchParams.set('state', pending.clientState);
    url.searchParams.set('iss', origin);
    return Response.redirect(url.toString(), 302);
  };

  const entraError = p.get('error');
  if (entraError) {
    log.warn('oauth', 'Entra sign-in refused', { client: pending.clientId, error: entraError });
    return back({
      error: 'access_denied',
      error_description: p.get('error_description')?.split('\r\n')[0] ?? entraError,
    });
  }

  try {
    const tokens = await entraRedeem({
      code: p.get('code') ?? '',
      redirectUri: `${origin}/oauth/callback`,
      codeVerifier: pending.entraVerifier,
    });
    const who = await verifyEntraIdToken(tokens.id_token, pending.nonce);
    const gid = await createGrant({
      oid: who.oid,
      name: who.name,
      email: who.email,
      clientId: pending.clientId,
      entraRefresh: tokens.refresh_token,
    });
    await cacheIdToken(gid, tokens.id_token, who.exp);

    const code = randomToken(32);
    const issued: IssuedCode = {
      gid,
      clientId: pending.clientId,
      redirectUri: pending.redirectUri,
      codeChallenge: pending.codeChallenge,
    };
    await kv().set(`code:${sha256(code)}`, issued, { ex: 300 });
    log.info('oauth', 'signed in with Entra', {
      user: who.email,
      client: pending.clientId,
      entraRefresh: !!tokens.refresh_token,
    });
    return back({ code });
  } catch (err) {
    log.error('oauth', 'Entra callback failed', { client: pending.clientId, error: errorText(err) });
    return back({ error: 'server_error', error_description: 'Sign-in with Microsoft failed' });
  }
}
