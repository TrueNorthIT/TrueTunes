import { sha256 } from '@/lib/crypto';
import { publicOrigin } from '@/lib/env';
import { CORS, getGrant, issueTokens, oauthError, type IssuedCode } from '@/lib/oauth/server';
import { verifyPkce } from '@/lib/oauth/validate';
import { log } from '@/lib/log';
import { kv } from '@/lib/store';

async function readParams(req: Request): Promise<URLSearchParams> {
  const type = req.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return new URLSearchParams(Object.entries(body).map(([k, v]) => [k, String(v)]));
  }
  const params = new URLSearchParams(await req.text());
  // Public clients may still send client_id in a Basic header.
  const basic = /^Basic\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1];
  if (basic && !params.get('client_id')) {
    const [id] = Buffer.from(basic, 'base64').toString('utf8').split(':');
    params.set('client_id', decodeURIComponent(id));
  }
  return params;
}

function tokens(body: object): Response {
  return Response.json(body, { headers: { ...CORS, 'Cache-Control': 'no-store', Pragma: 'no-cache' } });
}

export async function POST(req: Request): Promise<Response> {
  const p = await readParams(req);
  const origin = publicOrigin(req);
  const clientId = p.get('client_id');

  switch (p.get('grant_type')) {
    case 'authorization_code': {
      const issued = await kv().getdel<IssuedCode>(`code:${sha256(p.get('code') ?? '')}`);
      if (!issued) return oauthError('invalid_grant', 'Unknown, used or expired code');
      if (clientId && clientId !== issued.clientId)
        return oauthError('invalid_grant', 'Code was issued to another client');
      if (p.get('redirect_uri') && p.get('redirect_uri') !== issued.redirectUri) {
        return oauthError('invalid_grant', 'redirect_uri does not match');
      }
      if (!(await verifyPkce(p.get('code_verifier'), issued.codeChallenge))) {
        return oauthError('invalid_grant', 'PKCE verification failed');
      }
      const grant = await getGrant(issued.gid);
      if (!grant) return oauthError('invalid_grant', 'Sign-in has expired');
      log.info('oauth', 'tokens issued', { grant: 'authorization_code', user: grant.email, client: issued.clientId });
      return tokens(await issueTokens(origin, issued.gid, grant, issued.clientId));
    }

    case 'refresh_token': {
      const rec = await kv().getdel<{ gid: string; clientId: string }>(`rt:${sha256(p.get('refresh_token') ?? '')}`);
      if (!rec) return oauthError('invalid_grant', 'Unknown, used or expired refresh token');
      if (clientId && clientId !== rec.clientId)
        return oauthError('invalid_grant', 'Refresh token belongs to another client');
      const grant = await getGrant(rec.gid);
      if (!grant) return oauthError('invalid_grant', 'Sign-in has expired');
      log.info('oauth', 'tokens issued', { grant: 'refresh_token', user: grant.email, client: rec.clientId });
      return tokens(await issueTokens(origin, rec.gid, grant, rec.clientId));
    }

    default:
      return oauthError('unsupported_grant_type', 'Use authorization_code or refresh_token');
  }
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
