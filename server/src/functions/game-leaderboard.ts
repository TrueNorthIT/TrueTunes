import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { CosmosClient } from '@azure/cosmos';
import { londonDate } from './generate-game';

interface ScoreDoc {
  userName: string;
  mainScore: number;
  bonusScore: number;
  total: number;
  completedAt: number;
}

export async function gameLeaderboardHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const connStr = process.env['COSMOS_CONNECTION_STRING'];
  const dbName = process.env['COSMOS_DATABASE'] ?? 'truetunes';
  const scoresCtrName = process.env['COSMOS_SCORES_CONTAINER'] ?? 'scores';

  if (!connStr) {
    return { status: 500, jsonBody: { error: 'Cosmos not configured' } };
  }

  const dateParam = request.query.get('date') ?? 'today';
  const gameId = dateParam === 'today' ? londonDate() : dateParam;

  try {
    const client = new CosmosClient(connStr);
    const container = client.database(dbName).container(scoresCtrName);

    const { resources } = await container.items
      .query<ScoreDoc>({
        query:
          'SELECT c.userName, c.mainScore, c.bonusScore, c.total, c.completedAt FROM c WHERE c.gameId = @gameId',
        parameters: [{ name: '@gameId', value: gameId }],
      })
      .fetchAll();

    resources.sort((a, b) => b.total - a.total || a.completedAt - b.completedAt);

    context.log(`[game-leaderboard] gameId=${gameId} scores=${resources.length}`);

    return {
      status: 200,
      jsonBody: { gameId, scores: resources },
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    context.error('[game-leaderboard] failed:', err);
    return { status: 500, jsonBody: { error: String(err) } };
  }
}

app.http('game-leaderboard', {
  methods: ['GET'],
  route: 'game-leaderboard',
  authLevel: 'anonymous',
  handler: gameLeaderboardHandler,
});
