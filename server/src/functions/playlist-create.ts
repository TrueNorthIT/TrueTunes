import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { CosmosClient } from '@azure/cosmos';

export async function playlistCreateHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const connStr = process.env['COSMOS_CONNECTION_STRING'];
  const dbName = process.env['COSMOS_DATABASE'] ?? 'truetunes';

  if (!connStr) {
    return { status: 500, jsonBody: { error: 'Cosmos not configured' } };
  }

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
    const client = new CosmosClient(connStr);
    const container = client.database(dbName).container('playlists');

    await container.items.create(doc);

    context.log(`[playlist-create] id=${id} owner=${owner} isPublic=${isPublic}`);

    return {
      status: 201,
      jsonBody: doc,
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    context.error('[playlist-create] create failed:', err);
    return { status: 500, jsonBody: { error: String(err) } };
  }
}

app.http('playlist-create', {
  methods: ['POST'],
  route: 'playlists',
  authLevel: 'anonymous',
  handler: playlistCreateHandler,
});
