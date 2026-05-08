import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { CosmosClient } from '@azure/cosmos';

export async function playlistJoinHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const connStr = process.env['COSMOS_CONNECTION_STRING'];
  const dbName = process.env['COSMOS_DATABASE'] ?? 'truetunes';

  if (!connStr) {
    return { status: 500, jsonBody: { error: 'Cosmos not configured' } };
  }

  const id = request.params['id'];
  if (!id) {
    return { status: 400, jsonBody: { error: 'id param required' } };
  }

  let body: { userName?: string; action?: 'join' | 'leave' };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return { status: 400, jsonBody: { error: 'Invalid JSON body' } };
  }

  const { userName, action = 'join' } = body;
  if (!userName) {
    return { status: 400, jsonBody: { error: 'userName required' } };
  }

  try {
    const client = new CosmosClient(connStr);
    const container = client.database(dbName).container('playlists');

    const { resource } = await container.item(id, id).read();
    if (!resource) {
      return { status: 404, jsonBody: { error: 'Playlist not found' } };
    }

    if (action === 'join') {
      if (!resource.isPublic) {
        return { status: 403, jsonBody: { error: 'Playlist is private' } };
      }
      if (!resource.members.includes(userName)) {
        resource.members = [...resource.members, userName];
        resource.updatedAt = Date.now();
        await container.item(id, id).replace(resource);
      }
    } else {
      if (resource.owner === userName) {
        return { status: 400, jsonBody: { error: 'Owner cannot leave their own playlist' } };
      }
      resource.members = resource.members.filter((m: string) => m !== userName);
      resource.updatedAt = Date.now();
      await container.item(id, id).replace(resource);
    }

    context.log(`[playlist-join] id=${id} userName=${userName} action=${action}`);

    return {
      jsonBody: {
        id: resource.id,
        name: resource.name,
        owner: resource.owner,
        isPublic: resource.isPublic,
        memberCount: resource.members.length,
        trackCount: (resource.tracks ?? []).length,
        updatedAt: resource.updatedAt,
      },
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    context.error('[playlist-join] failed:', err);
    return { status: 500, jsonBody: { error: String(err) } };
  }
}

app.http('playlist-join', {
  methods: ['POST'],
  route: 'playlist/{id}/members',
  authLevel: 'anonymous',
  handler: playlistJoinHandler,
});
