import { publicOrigin } from '@/lib/env';
import { CORS, SCOPE, resourceUrl } from '@/lib/oauth/server';

/** RFC 9728 protected resource metadata for /mcp (also served at /.well-known/oauth-protected-resource/mcp). */
export function GET(req: Request): Response {
  const origin = publicOrigin(req);
  return Response.json(
    {
      resource: resourceUrl(origin),
      authorization_servers: [origin],
      scopes_supported: [SCOPE],
      bearer_methods_supported: ['header'],
      resource_name: 'TrueTunes',
      resource_documentation: origin,
    },
    { headers: { ...CORS, 'Cache-Control': 'public, max-age=300' } }
  );
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
