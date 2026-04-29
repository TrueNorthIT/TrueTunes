import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { CosmosClient } from '@azure/cosmos';
import { londonDate } from './generate-game';

interface ScoreDocWithGuesses {
  guesses?: {
    main: Array<'left' | 'right'>;
    bonus: string[];
  };
}

export async function gameStatsHandler(
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
      .query<ScoreDocWithGuesses>({
        query: 'SELECT c.guesses FROM c WHERE c.gameId = @gameId',
        parameters: [{ name: '@gameId', value: gameId }],
      })
      .fetchAll();

    const withGuesses = resources.filter((r) => r.guesses);
    const total = withGuesses.length;

    if (total === 0) {
      return {
        status: 200,
        jsonBody: { gameId, totalPlayers: 0, questions: [] },
        headers: { 'Access-Control-Allow-Origin': '*' },
      };
    }

    const questionCount = withGuesses[0].guesses!.main.length;
    const questions = Array.from({ length: questionCount }, (_, i) => {
      const mainPicks = { left: 0, right: 0 };
      const bonusPicks: Record<string, number> = {};

      for (const doc of withGuesses) {
        const mainGuess = doc.guesses!.main[i];
        if (mainGuess === 'left') mainPicks.left++;
        else if (mainGuess === 'right') mainPicks.right++;

        const bonusGuess = doc.guesses!.bonus[i];
        if (bonusGuess) bonusPicks[bonusGuess] = (bonusPicks[bonusGuess] ?? 0) + 1;
      }

      const bonusOptions = Object.entries(bonusPicks)
        .map(([name, count]) => ({ name, pct: Math.round((count / total) * 100) }))
        .sort((a, b) => b.pct - a.pct);

      return {
        questionIndex: i,
        leftPct: Math.round((mainPicks.left / total) * 100),
        rightPct: Math.round((mainPicks.right / total) * 100),
        bonusOptions,
      };
    });

    context.log(`[game-stats] gameId=${gameId} totalPlayers=${total}`);

    return {
      status: 200,
      jsonBody: { gameId, totalPlayers: total, questions },
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    context.error('[game-stats] failed:', err);
    return { status: 500, jsonBody: { error: String(err) } };
  }
}

app.http('game-stats', {
  methods: ['GET'],
  route: 'game-stats',
  authLevel: 'anonymous',
  handler: gameStatsHandler,
});
