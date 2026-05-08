import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { CosmosClient } from '@azure/cosmos';

interface PlaylistDoc {
  id: string;
  name: string;
  owner: string;
  isPublic: boolean;
  members: string[];
  tracks: unknown[];
  imageUrl?: string | null;
  createdAt: number;
  updatedAt: number;
}

export async function playlistListHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const connStr = process.env['COSMOS_CONNECTION_STRING'];
  const dbName = process.env['COSMOS_DATABASE'] ?? 'truetunes';

  if (!connStr) {
    return { status: 500, jsonBody: { error: 'Cosmos not configured' } };
  }

  const owner = request.query.get('owner');
  const member = request.query.get('member');

  if (!owner && !member) {
    return { status: 400, jsonBody: { error: 'owner or member query param required' } };
  }

  try {
    const client = new CosmosClient(connStr);
    const container = client.database(dbName).container('playlists');

    let query: { query: string; parameters: { name: string; value: string }[] };

    if (owner) {
      query = {
        query: 'SELECT c.id, c.name, c.owner, c.isPublic, c.members, c.imageUrl, c.createdAt, c.updatedAt, ARRAY_LENGTH(c.tracks) AS trackCount FROM c WHERE c.owner = @owner ORDER BY c.updatedAt DESC',
        parameters: [{ name: '@owner', value: owner }],
      };
    } else {
      query = {
        query: 'SELECT c.id, c.name, c.owner, c.isPublic, c.members, c.imageUrl, c.createdAt, c.updatedAt, ARRAY_LENGTH(c.tracks) AS trackCount FROM c WHERE c.isPublic = true AND ARRAY_CONTAINS(c.members, @member) AND c.owner != @member ORDER BY c.updatedAt DESC',
        parameters: [{ name: '@member', value: member! }],
      };
    }

    const { resources } = await container.items.query<PlaylistDoc & { trackCount: number }>(query).fetchAll();

    const result = resources.map((r) => ({
      id: r.id,
      name: r.name,
      owner: r.owner,
      isPublic: r.isPublic,
      memberCount: (r.members ?? []).length,
      trackCount: r.trackCount ?? 0,
      updatedAt: r.updatedAt,
      imageUrl: r.imageUrl ?? null,
    }));

    context.log(`[playlist-list] owner=${owner ?? ''} member=${member ?? ''} count=${result.length}`);

    return {
      jsonBody: result,
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    context.error('[playlist-list] query failed:', err);
    return { status: 500, jsonBody: { error: String(err) } };
  }
}

app.http('playlist-list', {
  methods: ['GET'],
  route: 'playlists',
  authLevel: 'anonymous',
  handler: playlistListHandler,
});
