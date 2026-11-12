import { randomToken } from '@/lib/crypto';
import { entraAuthorizeUrl } from '@/lib/entra';
import { publicOrigin } from '@/lib/env';
import { resolveClient, type PendingAuthorization } from '@/lib/oauth/server';
import { redirectMatches, s256 } from '@/lib/oauth/validate';
import { log } from '@/lib/log';
import { kv } from '@/lib/store';
import { errorPage } from '@/lib/oauth/error-page';

/** Checks the MCP client's request, then sends the person to Entra to sign in. */
export async function GET(req: Request): Promise<Response> {
  const p = new URL(req.url).searchParams;
  const origin = publicOrigin(req);

  const client = await resolveClient(p.get('client_id'));
  if (!client) {
    log.warn('oauth', 'authorize: unknown client', { client: p.get('client_id') });
    return errorPage(
      400,
      'Unknown app',
      'This app is not registered with TrueTunes. Try connecting again from your chat app.'
    );
  }
  const redirectUri = p.get('redirect_uri') ?? (client.redirect_uris.length === 1 ? client.redirect_uris[0] : '');
  if (!redirectUri || !redirectMatches(client.redirect_uris, redirectUri)) {
    log.warn('oauth', 'authorize: redirect mismatch', { client: client.client_id, redirect: redirectUri });
    return errorPage(400, 'Wrong redirect', 'The redirect address does not match the one this app registered.');
  }
  log.info('oauth', 'authorize', {
    client: client.client_id,
    name: client.client_name,
    redirect: new URL(redirectUri).host,
  });

  // From here on, errors go back to the client.
  const back = (error: string, description: string) => {
    const url = new URL(redirectUri);
    url.searchParams.set('error', error);
    url.searchParams.set('error_description', description);
    if (p.get('state')) url.searchParams.set('state', p.get('state')!);
    url.searchParams.set('iss', origin);
    return Response.redirect(url.toString(), 302);
  };
  if (p.get('response_type') !== 'code')
    return back('unsupported_response_type', 'Only response_type=code is supported');
  const codeChallenge = p.get('code_challenge');
  if (!codeChallenge || p.get('code_challenge_method') !== 'S256') {
    return back('invalid_request', 'PKCE with code_challenge_method=S256 is required');
  }
  const resource = p.get('resource') ?? undefined;
  if (resource && resource.replace(/\/$/, '') !== `${origin}/mcp`) {
    return back('invalid_target', `Unknown resource; use ${origin}/mcp`);
  }

  const entraVerifier = randomToken(32);
  const nonce = randomToken(16);
  const state = randomToken(24);
  const pending: PendingAuthorization = {
    clientId: client.client_id,
    redirectUri,
    codeChallenge,
    clientState: p.get('state') ?? undefined,
    resource,
    entraVerifier,
    nonce,
  };
  await kv().set(`authz:${state}`, pending, { ex: 600 });

  return Response.redirect(
    entraAuthorizeUrl({
      redirectUri: `${origin}/oauth/callback`,
      state,
      codeChallenge: await s256(entraVerifier),
      nonce,
    }),
    302
  );
}
