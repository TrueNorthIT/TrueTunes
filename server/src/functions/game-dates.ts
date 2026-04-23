import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { CosmosClient } from '@azure/cosmos';

interface GameRow {
  id: string;
  status: 'generating' | 'ready';
}

interface ScoreRow {
  gameId: string;
}

export async function gameDatesHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const connStr = process.env['COSMOS_CONNECTION_STRING'];
  const dbName = process.env['COSMOS_DATABASE'] ?? 'truetunes';
  const gamesCtrName = process.env['COSMOS_GAMES_CONTAINER'] ?? 'games';
  const scoresCtrName = process.env['COSMOS_SCORES_CONTAINER'] ?? 'scores';

  if (!connStr) {
    return { status: 500, jsonBody: { error: 'Cosmos not configured' } };
  }

  const userName = (request.query.get('userName') ?? '').trim();

  try {
    const client = new CosmosClient(connStr);
    const games = client.database(dbName).container(gamesCtrName);
    const scores = client.database(dbName).container(scoresCtrName);

    const { resources: gameRows } = await games.items
      .query<GameRow>({ query: 'SELECT c.id, c.status FROM c' })
      .fetchAll();

    let playedSet = new Set<string>();
    if (userName) {
      const { resources: scoreRows } = await scores.items
        .query<ScoreRow>({
          query: 'SELECT c.gameId FROM c WHERE c.userName = @userName',
          parameters: [{ name: '@userName', value: userName }],
        })
        .fetchAll();
      playedSet = new Set(scoreRows.map((s) => s.gameId));
    }

    const dates = gameRows
      .map((g) => ({
        gameId: g.id,
        status: g.status,
        userPlayed: playedSet.has(g.id),
      }))
      .sort((a, b) => (a.gameId < b.gameId ? 1 : a.gameId > b.gameId ? -1 : 0));

    context.log(`[game-dates] userName="${userName}" games=${dates.length} played=${playedSet.size}`);

    return {
      status: 200,
      jsonBody: { dates },
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    context.error('[game-dates] failed:', err);
    return { status: 500, jsonBody: { error: String(err) } };
  }
}

app.http('game-dates', {
  methods: ['GET'],
  route: 'game-dates',
  authLevel: 'anonymous',
  handler: gameDatesHandler,
});
