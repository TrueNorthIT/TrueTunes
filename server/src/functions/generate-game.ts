import { app, HttpRequest, HttpResponseInit, InvocationContext, Timer } from '@azure/functions';
import { CosmosClient } from '@azure/cosmos';
import { aggregateEvents, RawEvent } from '../shared/aggregate';
import { generateGame } from '../shared/gameGenerator';

const WINDOW_DAYS = 90;

export function londonDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year')?.value ?? '0000';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

async function runGenerate(
  context: InvocationContext,
  dateOverride?: string,
): Promise<{ ok: boolean; gameId: string; count: number; lowData: boolean; error?: string }> {
  const connStr = process.env['COSMOS_CONNECTION_STRING'];
  const dbName = process.env['COSMOS_DATABASE'] ?? 'truetunes';
  const eventsCtrName = process.env['COSMOS_CONTAINER'] ?? 'events';
  const gamesCtrName = process.env['COSMOS_GAMES_CONTAINER'] ?? 'games';

  const gameId = dateOverride ?? londonDate();

  if (!connStr) {
    return { ok: false, gameId, count: 0, lowData: true, error: 'Cosmos not configured' };
  }

  const client = new CosmosClient(connStr);
  const events = client.database(dbName).container(eventsCtrName);
  const games = client.database(dbName).container(gamesCtrName);

  const startMs = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const query = {
    query:
      'SELECT c.userId, c.eventType, c.trackName, c.artist, c.artistId, c.album, c.albumId, c.imageUrl, c.uri FROM c WHERE c.timestamp >= @start',
    parameters: [{ name: '@start', value: startMs }],
  };

  const { resources } = await events.items.query<RawEvent>(query).fetchAll();
  context.log(`[generate-game] events=${resources.length} window=${WINDOW_DAYS}d gameId=${gameId}`);

  const agg = aggregateEvents(resources);
  const { questions, lowData } = generateGame(agg, gameId);

  const doc = {
    id: gameId,
    status: 'ready' as const,
    generatedAt: Date.now(),
    lowData,
    questions,
  };

  await games.items.upsert(doc);
  context.log(`[generate-game] upserted id=${gameId} questions=${questions.length} lowData=${lowData}`);

  return { ok: true, gameId, count: questions.length, lowData };
}

export async function generateGameTimer(_myTimer: Timer, context: InvocationContext): Promise<void> {
  try {
    await runGenerate(context);
  } catch (err) {
    context.error('[generate-game:timer] failed:', err);
  }
}

export async function generateGameHttp(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const dateOverride = request.query.get('date') ?? undefined;
  try {
    const result = await runGenerate(context, dateOverride);
    if (!result.ok) {
      return { status: 500, jsonBody: result };
    }
    return { status: 200, jsonBody: result, headers: { 'Access-Control-Allow-Origin': '*' } };
  } catch (err) {
    context.error('[generate-game:http] failed:', err);
    return { status: 500, jsonBody: { error: String(err) } };
  }
}

app.timer('generate-game-timer', {
  schedule: '0 0 4 * * 1-5',
  handler: generateGameTimer,
});

app.http('generate-game', {
  methods: ['POST', 'GET'],
  authLevel: 'function',
  handler: generateGameHttp,
});
