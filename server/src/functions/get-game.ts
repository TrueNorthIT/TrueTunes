import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { CosmosClient } from '@azure/cosmos';
import { londonDate } from './generate-game';

export async function getGameHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const connStr = process.env['COSMOS_CONNECTION_STRING'];
  const dbName = process.env['COSMOS_DATABASE'] ?? 'truetunes';
  const gamesCtrName = process.env['COSMOS_GAMES_CONTAINER'] ?? 'games';

  if (!connStr) {
    return { status: 500, jsonBody: { error: 'Cosmos not configured' } };
  }

  const dateParam = request.query.get('date') ?? 'today';
  const gameId = dateParam === 'today' ? londonDate() : dateParam;

  try {
    const client = new CosmosClient(connStr);
    const container = client.database(dbName).container(gamesCtrName);
    const { resource } = await container.item(gameId, gameId).read();

    if (!resource) {
      return {
        status: 404,
        jsonBody: { status: 'pending', gameId, message: "Today's Queuedle hasn't been generated yet." },
        headers: { 'Access-Control-Allow-Origin': '*' },
      };
    }

    if (resource.status === 'generating') {
      return {
        status: 202,
        jsonBody: { status: 'pending', gameId },
        headers: { 'Access-Control-Allow-Origin': '*' },
      };
    }

    return {
      status: 200,
      jsonBody: resource,
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 404) {
      return {
        status: 404,
        jsonBody: { status: 'pending', gameId },
        headers: { 'Access-Control-Allow-Origin': '*' },
      };
    }
    context.error('[get-game] read failed:', err);
    return { status: 500, jsonBody: { error: String(err) } };
  }
}

app.http('get-game', {
  methods: ['GET'],
  route: 'game',
  authLevel: 'anonymous',
  handler: getGameHandler,
});
