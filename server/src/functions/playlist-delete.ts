import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getPlaylistContainer } from '../lib/getContainer';

export async function playlistDeleteHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const id = request.params['id'];
  if (!id) {
    return { status: 400, jsonBody: { error: 'id param required' } };
  }

  let body: { userName?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return { status: 400, jsonBody: { error: 'Invalid JSON body' } };
  }

  const { userName } = body;
  if (!userName) {
    return { status: 400, jsonBody: { error: 'userName required' } };
  }

  try {
    const container = getPlaylistContainer();

    const { resource } = await container.item(id, id).read();
    if (!resource) {
      return { status: 404, jsonBody: { error: 'Playlist not found' } };
    }
    if (resource.owner !== userName) {
      return { status: 403, jsonBody: { error: 'Only the owner can delete a playlist' } };
    }
    if (resource.isFavourites) {
      return { status: 403, jsonBody: { error: 'Favourites playlist cannot be deleted' } };
    }

    await container.item(id, id).delete();

    context.log(`[playlist-delete] id=${id} owner=${userName}`);

    return {
      status: 200,
      jsonBody: { ok: true },
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    context.error('[playlist-delete] failed:', err);
    return { status: 500, jsonBody: { error: 'Internal server error' } };
  }
}

app.http('playlist-delete', {
  methods: ['DELETE'],
  route: 'playlist/{id}',
  authLevel: 'anonymous',
  handler: playlistDeleteHandler,
});
