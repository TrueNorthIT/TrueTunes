import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getPlaylistContainer } from '../lib/getContainer';

interface PlaylistDoc {
  id: string;
  name: string;
  owner: string;
  isPublic: boolean;
  isFavourites?: boolean;
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
  const owner = request.query.get('owner');
  const member = request.query.get('member');

  if (!owner && !member) {
    return { status: 400, jsonBody: { error: 'owner or member query param required' } };
  }

  try {
    const container = getPlaylistContainer();

    let query: { query: string; parameters: { name: string; value: string }[] };

    if (owner) {
      query = {
        query: 'SELECT c.id, c.name, c.owner, c.isPublic, c.isFavourites, c.members, c.imageUrl, c.createdAt, c.updatedAt, ARRAY_LENGTH(c.tracks) AS trackCount FROM c WHERE c.owner = @owner ORDER BY c.updatedAt DESC',
        parameters: [{ name: '@owner', value: owner }],
      };
    } else {
      query = {
        query: 'SELECT c.id, c.name, c.owner, c.isPublic, c.isFavourites, c.members, c.imageUrl, c.createdAt, c.updatedAt, ARRAY_LENGTH(c.tracks) AS trackCount FROM c WHERE ARRAY_CONTAINS(c.members, @member) AND c.owner != @member ORDER BY c.updatedAt DESC',
        parameters: [{ name: '@member', value: member! }],
      };
    }

    const { resources } = await container.items.query<PlaylistDoc & { trackCount: number }>(query).fetchAll();

    const result = resources.map((r) => ({
      id: r.id,
      name: r.name,
      owner: r.owner,
      isPublic: r.isPublic,
      isFavourites: r.isFavourites ?? false,
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
    return { status: 500, jsonBody: { error: 'Internal server error' } };
  }
}

app.http('playlist-list', {
  methods: ['GET'],
  route: 'playlists',
  authLevel: 'anonymous',
  handler: playlistListHandler,
});
