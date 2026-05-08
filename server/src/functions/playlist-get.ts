import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { CosmosClient } from '@azure/cosmos';

export async function playlistGetHandler(
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

  try {
    const client = new CosmosClient(connStr);
    const container = client.database(dbName).container('playlists');

    const { resource } = await container.item(id, id).read();

    if (!resource) {
      return { status: 404, jsonBody: { error: 'Playlist not found' } };
    }

    context.log(`[playlist-get] id=${id} tracks=${resource.tracks?.length ?? 0}`);

    return {
      jsonBody: resource,
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    context.error('[playlist-get] read failed:', err);
    return { status: 500, jsonBody: { error: String(err) } };
  }
}

app.http('playlist-get', {
  methods: ['GET'],
  route: 'playlist/{id}',
  authLevel: 'anonymous',
  handler: playlistGetHandler,
});
