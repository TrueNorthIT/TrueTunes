import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { withOCC } from '../lib/withOCC';
import { getPlaylistContainer } from '../lib/getContainer';

export async function playlistJoinHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
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
    const container = getPlaylistContainer();

    const resource = await withOCC(
      () => container.item(id, id).read(),
      (doc) => {
        if (action === 'join') {
          if (!doc.isPublic) {
            throw Object.assign(new Error('Playlist is private'), { statusCode: 403 });
          }
          if (!doc.members.includes(userName)) {
            doc.members = [...doc.members, userName];
            doc.updatedAt = Date.now();
          }
        } else {
          if (doc.owner === userName) {
            throw Object.assign(new Error('Owner cannot leave their own playlist'), { statusCode: 400 });
          }
          doc.members = doc.members.filter((m: string) => m !== userName);
          doc.updatedAt = Date.now();
        }
      },
      (doc, etag) => container.item(id, id).replace(doc, { accessCondition: { type: 'IfMatch', condition: etag } }),
    );

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
    const code = (err as { statusCode?: number }).statusCode;
    if (code === 404) return { status: 404, jsonBody: { error: 'Playlist not found' } };
    if (code === 403) return { status: 403, jsonBody: { error: (err as Error).message } };
    if (code === 400) return { status: 400, jsonBody: { error: (err as Error).message } };
    context.error('[playlist-join] failed:', err);
    return { status: 500, jsonBody: { error: 'Internal server error' } };
  }
}

app.http('playlist-join', {
  methods: ['POST'],
  route: 'playlist/{id}/members',
  authLevel: 'anonymous',
  handler: playlistJoinHandler,
});
