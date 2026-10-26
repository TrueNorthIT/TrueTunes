import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { callerName } from '../lib/caller';
import { getPlaylistContainer } from '../lib/getContainer';

export async function favouritesEnsureHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const caller = await callerName(request, context, request.params['userName']);
  if ('response' in caller) return caller.response;
  const userName = caller.name;

  const id = `fav-${userName}`;

  try {
    const container = getPlaylistContainer();

    // Return existing
    const { resource } = await container.item(id, id).read();
    if (resource) {
      return { jsonBody: resource };
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
      return { status: 201, jsonBody: doc };
    } catch (createErr) {
      // 409 = concurrent create — another request beat us; read and return the existing doc
      if ((createErr as { code?: number }).code === 409) {
        const { resource: existing } = await container.item(id, id).read();
        if (existing) return { jsonBody: existing };
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
