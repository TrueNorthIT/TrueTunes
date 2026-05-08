import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { CosmosClient } from '@azure/cosmos';

export async function profileGetHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const userName = request.params['userName'];
  if (!userName) return { status: 400, jsonBody: { error: 'userName required' } };

  const connStr = process.env['COSMOS_CONNECTION_STRING'];
  const dbName  = process.env['COSMOS_DATABASE'] ?? 'truetunes';

  if (!connStr) return { status: 500, jsonBody: { error: 'Cosmos not configured' } };

  try {
    const { resource } = await new CosmosClient(connStr)
      .database(dbName)
      .container('profiles')
      .item(userName, userName)
      .read();

    return {
      jsonBody: resource ?? { id: userName },
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 404) {
      return { jsonBody: { id: userName }, headers: { 'Access-Control-Allow-Origin': '*' } };
    }
    context.error('[profile-get] failed:', err);
    return { status: 500, jsonBody: { error: String(err) } };
  }
}

app.http('profile-get', {
  methods: ['GET'],
  route: 'profile/{userName}',
  authLevel: 'anonymous',
  handler: profileGetHandler,
});
