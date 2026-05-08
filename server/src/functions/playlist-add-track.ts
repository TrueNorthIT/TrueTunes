import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { withOCC } from '../lib/withOCC';
import { getPlaylistContainer } from '../lib/getContainer';

interface PlaylistTrack {
  uri: string;
  trackName: string;
  artist: string;
  albumName?: string;
  imageUrl?: string | null;
  serviceId: string;
  accountId: string;
  addedBy: string;
  addedAt: number;
}

export async function playlistAddTrackHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const id = request.params['id'];
  if (!id) {
    return { status: 400, jsonBody: { error: 'id param required' } };
  }

  let body: { track?: PlaylistTrack; userName?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return { status: 400, jsonBody: { error: 'Invalid JSON body' } };
  }

  const { track, userName } = body;
  if (!track || !userName) {
    return { status: 400, jsonBody: { error: 'track and userName required' } };
  }

  try {
    const container = getPlaylistContainer();

    const updatedTrack: PlaylistTrack = { ...track, addedBy: userName, addedAt: Date.now() };

    const resource = await withOCC(
      () => container.item(id, id).read(),
      (doc) => {
        if (!doc.members.includes(userName) && doc.owner !== userName) {
          throw Object.assign(new Error('Not a member of this playlist'), { statusCode: 403 });
        }
        doc.tracks = [...(doc.tracks ?? []), updatedTrack];
        doc.updatedAt = Date.now();
      },
      (doc, etag) => container.item(id, id).replace(doc, { accessCondition: { type: 'IfMatch', condition: etag } }),
    );

    context.log(`[playlist-add-track] id=${id} userName=${userName} track=${track.trackName}`);

    return {
      jsonBody: resource,
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    const code = (err as { statusCode?: number }).statusCode;
    if (code === 404) return { status: 404, jsonBody: { error: 'Playlist not found' } };
    if (code === 403) return { status: 403, jsonBody: { error: 'Not a member of this playlist' } };
    context.error('[playlist-add-track] failed:', err);
    return { status: 500, jsonBody: { error: 'Internal server error' } };
  }
}

app.http('playlist-add-track', {
  methods: ['POST'],
  route: 'playlist/{id}/tracks',
  authLevel: 'anonymous',
  handler: playlistAddTrackHandler,
});
