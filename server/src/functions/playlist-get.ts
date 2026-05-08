import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getPlaylistContainer } from '../lib/getContainer';

export async function playlistGetHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const id = request.params['id'];
  if (!id) {
    return { status: 400, jsonBody: { error: 'id param required' } };
  }

  try {
    const container = getPlaylistContainer();

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
    return { status: 500, jsonBody: { error: 'Internal server error' } };
  }
}

app.http('playlist-get', {
  methods: ['GET'],
  route: 'playlist/{id}',
  authLevel: 'anonymous',
  handler: playlistGetHandler,
});
