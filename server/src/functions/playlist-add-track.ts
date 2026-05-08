import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { CosmosClient } from '@azure/cosmos';

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
  const connStr = process.env['COSMOS_CONNECTION_STRING'];
  const dbName = process.env['COSMOS_DATABASE'] ?? 'truetunes';

  if (!connStr) {
    return { status: 500, jsonBody: { error: 'Cosmos not configured' } };
  }

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
    const client = new CosmosClient(connStr);
    const container = client.database(dbName).container('playlists');

    const { resource } = await container.item(id, id).read();
    if (!resource) {
      return { status: 404, jsonBody: { error: 'Playlist not found' } };
    }

    if (!resource.members.includes(userName) && resource.owner !== userName) {
      return { status: 403, jsonBody: { error: 'Not a member of this playlist' } };
    }

    const updatedTrack: PlaylistTrack = { ...track, addedBy: userName, addedAt: Date.now() };
    resource.tracks = [...(resource.tracks ?? []), updatedTrack];
    resource.updatedAt = Date.now();

    await container.item(id, id).replace(resource);

    context.log(`[playlist-add-track] id=${id} userName=${userName} track=${track.trackName}`);

    return {
      jsonBody: resource,
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    context.error('[playlist-add-track] failed:', err);
    return { status: 500, jsonBody: { error: String(err) } };
  }
}

app.http('playlist-add-track', {
  methods: ['POST'],
  route: 'playlist/{id}/tracks',
  authLevel: 'anonymous',
  handler: playlistAddTrackHandler,
});
