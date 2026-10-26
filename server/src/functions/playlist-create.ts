import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { callerName } from '../lib/caller';
import { getPlaylistContainer } from '../lib/getContainer';

export async function playlistCreateHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  let body: { name?: string; isPublic?: boolean; owner?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return { status: 400, jsonBody: { error: 'Invalid JSON body' } };
  }

  const { name, isPublic = false } = body;
  const caller = await callerName(request, context, body.owner);
  if ('response' in caller) return caller.response;
  const owner = caller.name;
  if (!name || !owner) {
    return { status: 400, jsonBody: { error: 'name and owner required' } };
  }
  const trimmedName = name.trim();
  if (!trimmedName) return { status: 400, jsonBody: { error: 'name cannot be empty' } };
  if (trimmedName.length > 200) return { status: 400, jsonBody: { error: 'name too long (max 200 chars)' } };

  const id = crypto.randomUUID();
  const now = Date.now();

  const doc = {
    id,
    name: trimmedName,
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
