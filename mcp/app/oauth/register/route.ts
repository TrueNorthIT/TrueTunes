import { CORS, oauthError, registerClient } from '@/lib/oauth/server';

/** RFC 7591 Dynamic Client Registration, for MCP clients that don't use a Client ID Metadata Document. */
export async function POST(req: Request): Promise<Response> {
  let meta: Record<string, unknown>;
  try {
    meta = (await req.json()) as Record<string, unknown>;
  } catch {
    return oauthError('invalid_client_metadata', 'Body must be JSON');
  }
  try {
    const client = await registerClient(meta);
    return Response.json(client, { status: 201, headers: { ...CORS, 'Cache-Control': 'no-store' } });
  } catch (err) {
    const code = (err as { code?: string }).code ?? 'invalid_client_metadata';
    return oauthError(code, err instanceof Error ? err.message : 'Invalid client metadata');
  }
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
