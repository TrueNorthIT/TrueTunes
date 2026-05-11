import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { withOCC } from '../lib/withOCC';
import { getPlaylistContainer } from '../lib/getContainer';

export async function playlistUpdateHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const id = request.params['id'];
  if (!id) {
    return { status: 400, jsonBody: { error: 'id param required' } };
  }

  let body: { userName?: string; name?: string; isPublic?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return { status: 400, jsonBody: { error: 'Invalid JSON body' } };
  }

  const { userName, name, isPublic } = body;
  if (!userName) {
    return { status: 400, jsonBody: { error: 'userName required' } };
  }
  if (name === undefined && isPublic === undefined) {
    return { status: 400, jsonBody: { error: 'At least one of name or isPublic required' } };
  }
  if (name !== undefined) {
    const trimmed = name.trim();
    if (!trimmed) return { status: 400, jsonBody: { error: 'name cannot be empty' } };
    if (trimmed.length > 200) return { status: 400, jsonBody: { error: 'name too long (max 200 chars)' } };
  }

  try {
    const container = getPlaylistContainer();

    const resource = await withOCC(
      () => container.item(id, id).read(),
      (doc) => {
        if (doc.owner !== userName) {
          throw Object.assign(new Error('Only the owner can update a playlist'), { statusCode: 403 });
        }
        if (doc.isFavourites && isPublic === true) {
          throw Object.assign(new Error('Favourites playlist cannot be made public'), { statusCode: 403 });
        }
        if (name !== undefined) doc.name = name.trim();
        if (isPublic !== undefined) doc.isPublic = isPublic;
        doc.updatedAt = Date.now();
      },
      (doc, etag) => container.item(id, id).replace(doc, { accessCondition: { type: 'IfMatch', condition: etag } }),
    );

    context.log(`[playlist-update] id=${id} owner=${userName} name=${name} isPublic=${isPublic}`);

    return {
      jsonBody: resource,
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    const code = (err as { statusCode?: number }).statusCode;
    if (code === 404) return { status: 404, jsonBody: { error: 'Playlist not found' } };
    if (code === 403) return { status: 403, jsonBody: { error: (err as Error).message } };
    context.error('[playlist-update] failed:', err);
    return { status: 500, jsonBody: { error: 'Internal server error' } };
  }
}

app.http('playlist-update', {
  methods: ['PUT'],
  route: 'playlist/{id}',
  authLevel: 'anonymous',
  handler: playlistUpdateHandler,
});
