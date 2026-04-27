import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { CosmosClient } from '@azure/cosmos';

function scoreIdFor(gameId: string, userName: string): string {
  return `${gameId}|${userName}`;
}

export async function getMyScoreHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const connStr = process.env['COSMOS_CONNECTION_STRING'];
  const dbName = process.env['COSMOS_DATABASE'] ?? 'truetunes';
  const scoresCtrName = process.env['COSMOS_SCORES_CONTAINER'] ?? 'scores';

  if (!connStr) {
    return { status: 500, jsonBody: { error: 'Cosmos not configured' } };
  }

  const gameId = request.query.get('gameId');
  const userName = (request.query.get('userName') ?? '').trim();

  if (!gameId || !userName) {
    return { status: 400, jsonBody: { error: 'Missing gameId or userName' } };
  }

  try {
    const client = new CosmosClient(connStr);
    const container = client.database(dbName).container(scoresCtrName);
    const scoreId = scoreIdFor(gameId, userName);
    const { resource } = await container.item(scoreId, gameId).read();
    if (!resource) {
      return { status: 404, jsonBody: { error: 'Score not found' }, headers: { 'Access-Control-Allow-Origin': '*' } };
    }
    return {
      status: 200,
      jsonBody: {
        score: {
          mainScore: resource.mainScore,
          bonusScore: resource.bonusScore,
          guesses: resource.guesses,
        },
      },
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === 404) {
      return { status: 404, jsonBody: { error: 'Score not found' }, headers: { 'Access-Control-Allow-Origin': '*' } };
    }
    context.error('[get-my-score] failed:', err);
    return { status: 500, jsonBody: { error: String(err) } };
  }
}

app.http('get-my-score', {
  methods: ['GET'],
  route: 'my-score',
  authLevel: 'anonymous',
  handler: getMyScoreHandler,
});
