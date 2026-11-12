import { publicOrigin } from '@/lib/env';
import { CORS, authServerMetadata } from '@/lib/oauth/server';

/** RFC 8414 authorization server metadata. */
export function GET(req: Request): Response {
  return Response.json(authServerMetadata(publicOrigin(req)), {
    headers: { ...CORS, 'Cache-Control': 'public, max-age=300' },
  });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
