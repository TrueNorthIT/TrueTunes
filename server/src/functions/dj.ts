import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { CosmosClient } from '@azure/cosmos';
import { buildDjSet } from '../shared/dj';
import { historyQuery } from '../shared/cosmosAdapters';
import { londonDayKey } from '../shared/djDay';
import type { RawEvent } from '../shared/aggregate';

/** Who counts as "in the office" when the caller doesn't say. */
const ACTIVE_HOURS = 4;

interface TimedEvent extends RawEvent {
  timestamp?: number;
}

export async function djHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const connStr = process.env['COSMOS_CONNECTION_STRING'];
  const dbName = process.env['COSMOS_DATABASE'] ?? 'truetunes';
  const ctrName = process.env['COSMOS_CONTAINER'] ?? 'events';

  if (!connStr) {
    return { status: 500, jsonBody: { error: 'Cosmos not configured' } };
  }

  const limit = Math.min(Number(request.query.get('limit')) || 20, 50);
  const requested = (request.query.get('users') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const excludeUris = (request.query.get('exclude') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  try {
    const container = new CosmosClient(connStr).database(dbName).container(ctrName);

    // All-time history, same as the auto-queue: the DJ learns from everything.
    const { resources } = await container.items.query<TimedEvent>(historyQuery()).fetchAll();

    // No explicit listener list — infer the room from who has queued recently.
    // Falls back to everyone so an empty office still gets a set.
    let users = requested;
    if (users.length === 0) {
      const activeSince = Date.now() - ACTIVE_HOURS * 60 * 60 * 1000;
      users = [...new Set(resources.filter((e) => (e.timestamp ?? 0) >= activeSince && e.userId).map((e) => e.userId))];
    }

    // Same day seed as the auto-queue, so this fallback preview agrees with it (#104).
    const result = buildDjSet(resources, { users, limit, excludeUris, seed: londonDayKey(Date.now()) });

    context.log(
      `[dj] events=${resources.length} listeners=${result.listeners.length} tracks=${result.tracks.length} artists=${result.artists.length}`
    );

    return {
      status: 200,
      jsonBody: {
        tracks: result.tracks,
        artists: result.artists,
        listeners: result.listeners,
        artistsConsidered: result.artistsConsidered,
        /** True when we guessed the room rather than being told. */
        inferredListeners: requested.length === 0,
      },
    };
  } catch (err) {
    context.error('[dj] failed:', err);
    return { status: 500, jsonBody: { error: String(err) } };
  }
}

app.http('dj', {
  route: 'dj',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: djHandler,
});
