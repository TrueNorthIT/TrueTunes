import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getPlaylistContainer } from '../lib/getContainer';

export async function playlistCreateHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  let body: { name?: string; isPublic?: boolean; owner?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return { status: 400, jsonBody: { error: 'Invalid JSON body' } };
  }

  const { name, isPublic = false, owner } = body;
  if (!name || !owner) {
    return { status: 400, jsonBody: { error: 'name and owner required' } };
  }

  const id = crypto.randomUUID();
  const now = Date.now();

  const doc = {
    id,
    name,
    owner,
    isPublic,
    members: [owner],
    tracks: [],
    createdAt: now,
    updatedAt: now,
  };

  try {
    const container = getPlaylistContainer();

    await container.items.create(doc);

    context.log(`[playlist-create] id=${id} owner=${owner} isPublic=${isPublic}`);

    return {
      status: 201,
      jsonBody: doc,
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    context.error('[playlist-create] create failed:', err);
    return { status: 500, jsonBody: { error: 'Internal server error' } };
  }
}

app.http('playlist-create', {
  methods: ['POST'],
  route: 'playlists',
  authLevel: 'anonymous',
  handler: playlistCreateHandler,
});
