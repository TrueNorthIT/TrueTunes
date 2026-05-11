import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getPlaylistContainer } from '../lib/getContainer';

export async function favouritesEnsureHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const userName = request.params['userName'];
  if (!userName) {
    return { status: 400, jsonBody: { error: 'userName param required' } };
  }

  const id = `fav-${userName}`;

  try {
    const container = getPlaylistContainer();

    // Return existing
    const { resource } = await container.item(id, id).read();
    if (resource) {
      return { jsonBody: resource, headers: { 'Access-Control-Allow-Origin': '*' } };
    }

    // Create
    const now = Date.now();
    const doc = {
      id,
      name: 'Favourites',
      owner: userName,
      isPublic: false,
      isFavourites: true,
      members: [userName],
      tracks: [],
      createdAt: now,
      updatedAt: now,
    };

    try {
      await container.items.create(doc);
      context.log(`[favourites-ensure] created for ${userName}`);
      return { status: 201, jsonBody: doc, headers: { 'Access-Control-Allow-Origin': '*' } };
    } catch (createErr) {
      // 409 = concurrent create — another request beat us; read and return the existing doc
      if ((createErr as { code?: number }).code === 409) {
        const { resource: existing } = await container.item(id, id).read();
        if (existing) return { jsonBody: existing, headers: { 'Access-Control-Allow-Origin': '*' } };
      }
      throw createErr;
    }
  } catch (err) {
    context.error('[favourites-ensure] failed:', err);
    return { status: 500, jsonBody: { error: 'Internal server error' } };
  }
}

app.http('favourites-ensure', {
  methods: ['POST'],
  route: 'profile/{userName}/favourites',
  authLevel: 'anonymous',
  handler: favouritesEnsureHandler,
});
