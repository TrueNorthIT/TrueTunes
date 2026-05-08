import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { withOCC } from '../lib/withOCC';
import { getPlaylistContainer } from '../lib/getContainer';

export async function playlistRemoveTrackHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const id = request.params['id'];
  if (!id) {
    return { status: 400, jsonBody: { error: 'id param required' } };
  }

  let body: { userName?: string; uri?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return { status: 400, jsonBody: { error: 'Invalid JSON body' } };
  }

  const { userName, uri } = body;
  if (!userName || !uri) {
    return { status: 400, jsonBody: { error: 'userName and uri required' } };
  }

  try {
    const container = getPlaylistContainer();

    const resource = await withOCC(
      () => container.item(id, id).read(),
      (doc) => {
        if (doc.owner !== userName && !doc.members.includes(userName)) {
          throw Object.assign(new Error('Not a member of this playlist'), { statusCode: 403 });
        }
        const tracks: { uri: string }[] = doc.tracks ?? [];
        const firstIdx = tracks.findIndex((t) => t.uri === uri);
        if (firstIdx === -1) {
          throw Object.assign(new Error('Track not found in playlist'), { statusCode: 404 });
        }
        tracks.splice(firstIdx, 1);
        doc.tracks = tracks;
        doc.updatedAt = Date.now();
      },
      (doc, etag) => container.item(id, id).replace(doc, { accessCondition: { type: 'IfMatch', condition: etag } }),
    );

    context.log(`[playlist-remove-track] id=${id} uri=${uri}`);

    return {
      jsonBody: resource,
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    const code = (err as { statusCode?: number }).statusCode;
    if (code === 404) return { status: 404, jsonBody: { error: (err as Error).message } };
    if (code === 403) return { status: 403, jsonBody: { error: 'Not a member of this playlist' } };
    context.error('[playlist-remove-track] failed:', err);
    return { status: 500, jsonBody: { error: 'Internal server error' } };
  }
}

app.http('playlist-remove-track', {
  methods: ['DELETE'],
  route: 'playlist/{id}/tracks',
  authLevel: 'anonymous',
  handler: playlistRemoveTrackHandler,
});
