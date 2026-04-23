import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { CosmosClient } from '@azure/cosmos';
import { londonDate } from './generate-game';
import { sendScoreAnnouncement, sendLeaderboard } from '../shared/vestaboard';

const LEADERBOARD_DELAY_MS = 15_000;

interface SubmitBody {
  gameId: string;
  userName: string;
  guesses: {
    main: Array<'left' | 'right'>;
    bonus: string[];
  };
}

interface GameDoc {
  id: string;
  status: 'generating' | 'ready';
  questions: Array<{
    index: number;
    left: { topQueuer: string };
    right: { topQueuer: string };
    winner: 'left' | 'right';
    bonusItem?: 'left' | 'right';
  }>;
}

function scoreIdFor(gameId: string, userName: string): string {
  return `${gameId}|${userName}`;
}

export async function submitScoreHandler(
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

  let body: SubmitBody;
  try {
    body = (await request.json()) as SubmitBody;
  } catch {
    return { status: 400, jsonBody: { error: 'Invalid JSON body' } };
  }

  const userName = (body.userName ?? '').trim();
  if (!body.gameId || !userName || !body.guesses) {
    return { status: 400, jsonBody: { error: 'Missing required fields' } };
  }

  try {
    const client = new CosmosClient(connStr);
    const games = client.database(dbName).container(gamesCtrName);
    const scores = client.database(dbName).container(scoresCtrName);

    const { resource: game } = await games.item(body.gameId, body.gameId).read<GameDoc>();
    if (!game || game.status !== 'ready') {
      return { status: 404, jsonBody: { error: 'Game not found or not ready' } };
    }

    const scoreId = scoreIdFor(body.gameId, userName);
    try {
      const { resource: existing } = await scores.item(scoreId, body.gameId).read();
      if (existing) {
        return {
          status: 409,
          jsonBody: { error: 'Already submitted', existing },
          headers: { 'Access-Control-Allow-Origin': '*' },
        };
      }
    } catch (err: unknown) {
      if ((err as { code?: number }).code !== 404) throw err;
    }

    let mainScore = 0;
    for (let i = 0; i < game.questions.length; i++) {
      const q = game.questions[i];
      if (body.guesses.main[i] === q.winner) mainScore++;
    }

    let bonusScore = 0;
    for (let i = 0; i < game.questions.length; i++) {
      const q = game.questions[i];
      const bonusSide = q.bonusItem ?? q.winner;
      const bonusTarget = bonusSide === 'left' ? q.left : q.right;
      if (body.guesses.bonus[i] === bonusTarget.topQueuer) bonusScore++;
    }

    const total = mainScore + bonusScore;
    const scoreDoc = {
      id: scoreId,
      gameId: body.gameId,
      userName,
      mainScore,
      bonusScore,
      total,
      guesses: body.guesses,
      completedAt: Date.now(),
    };

    await scores.items.create(scoreDoc);
    context.log(`[submit-score] ${userName} gameId=${body.gameId} total=${total}`);

    if (body.gameId === londonDate()) {
      const maxPerRound = game.questions.length;
      const log = (msg: string, ...args: unknown[]) => context.log(msg, ...args);
      try {
        await sendScoreAnnouncement(userName, mainScore, bonusScore, maxPerRound, log);
      } catch (err) {
        context.error('[submit-score] vestaboard announcement failed:', err);
      }
      // Schedule the leaderboard flip after a short delay so the announcement
      // has time to read on the board. Fire-and-forget — the Functions Node
      // worker keeps the event loop alive for in-flight timers.
      setTimeout(() => {
        void (async () => {
          try {
            const { resources: latest } = await scores.items
              .query<{ userName: string; total: number }>({
                query:
                  'SELECT c.userName, c.total FROM c WHERE c.gameId = @gameId',
                parameters: [{ name: '@gameId', value: body.gameId }],
              })
              .fetchAll();
            latest.sort((a, b) => b.total - a.total);
            await sendLeaderboard(latest, log);
          } catch (err) {
            context.error('[submit-score] vestaboard leaderboard failed:', err);
          }
        })();
      }, LEADERBOARD_DELAY_MS);
    }

    return {
      status: 201,
      jsonBody: scoreDoc,
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    context.error('[submit-score] failed:', err);
    return { status: 500, jsonBody: { error: String(err) } };
  }
}

app.http('submit-score', {
  methods: ['POST'],
  route: 'score',
  authLevel: 'anonymous',
  handler: submitScoreHandler,
});
