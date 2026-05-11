import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { withOCC } from '../lib/withOCC';
import { getPlaylistContainer } from '../lib/getContainer';

export async function playlistReorderHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const id = request.params['id'];
  if (!id) {
    return { status: 400, jsonBody: { error: 'id param required' } };
  }

  let body: { userName?: string; fromIndex?: number; toIndex?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return { status: 400, jsonBody: { error: 'Invalid JSON body' } };
  }

  const { userName, fromIndex, toIndex } = body;
  if (!userName || fromIndex === undefined || toIndex === undefined) {
    return { status: 400, jsonBody: { error: 'userName, fromIndex, toIndex required' } };
  }
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) {
    return { status: 400, jsonBody: { error: 'fromIndex and toIndex must be integers' } };
  }

  try {
    const container = getPlaylistContainer();

    const resource = await withOCC(
      () => container.item(id, id).read(),
      (doc) => {
        if (doc.owner !== userName && !doc.members.includes(userName)) {
          throw Object.assign(new Error('Not a member of this playlist'), { statusCode: 403 });
        }
        const tracks: unknown[] = [...(doc.tracks ?? [])];
        if (fromIndex < 0 || fromIndex >= tracks.length || toIndex < 0 || toIndex >= tracks.length) {
          throw Object.assign(new Error('Index out of range'), { statusCode: 400 });
        }
        const [moved] = tracks.splice(fromIndex, 1);
        tracks.splice(toIndex, 0, moved);
        doc.tracks = tracks;
        doc.updatedAt = Date.now();
      },
      (doc, etag) => container.item(id, id).replace(doc, { accessCondition: { type: 'IfMatch', condition: etag } }),
    );

    context.log(`[playlist-reorder] id=${id} userName=${userName} from=${fromIndex} to=${toIndex}`);

    return {
      jsonBody: resource,
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    const code = (err as { statusCode?: number }).statusCode;
    if (code === 404) return { status: 404, jsonBody: { error: 'Playlist not found' } };
    if (code === 403) return { status: 403, jsonBody: { error: 'Not a member of this playlist' } };
    if (code === 400) return { status: 400, jsonBody: { error: 'Index out of range' } };
    context.error('[playlist-reorder] failed:', err);
    return { status: 500, jsonBody: { error: 'Internal server error' } };
  }
}

app.http('playlist-reorder', {
  methods: ['PATCH'],
  route: 'playlist/{id}/tracks',
  authLevel: 'anonymous',
  handler: playlistReorderHandler,
});
