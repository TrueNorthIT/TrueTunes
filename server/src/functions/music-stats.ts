import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { CosmosClient } from '@azure/cosmos';
import { computeMusicStats, MusicEvent, MusicStatsResult, TrackMeta } from '../shared/musicStats';

// Every event is read on each computation, so keep the answer for a few
// minutes per instance: the page is a look-back, not a live feed.
const CACHE_MS = 5 * 60_000;
let cached: { at: number; body: MusicStatsResult } | null = null;

export async function musicStatsHandler(_request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const connStr = process.env['COSMOS_CONNECTION_STRING'];
  const dbName = process.env['COSMOS_DATABASE'] ?? 'truetunes';
  const eventsName = process.env['COSMOS_CONTAINER'] ?? 'events';
  const tracksName = process.env['COSMOS_TRACKS_CONTAINER'] ?? 'tracks';

  if (!connStr) {
    return { status: 500, jsonBody: { error: 'Cosmos not configured' } };
  }

  const headers = { 'Access-Control-Allow-Origin': '*' };
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return { jsonBody: cached.body, headers };
  }

  try {
    const db = new CosmosClient(connStr).database(dbName);
    const [events, tracks] = await Promise.all([
      db
        .container(eventsName)
        .items.query<MusicEvent>(
          'SELECT c.userId, c.eventType, c.uri, c.trackName, c.artist, c.imageUrl, c.timestamp FROM c'
        )
        .fetchAll(),
      db
        .container(tracksName)
        .items.query<{ id: string } & TrackMeta>('SELECT c.id, c.durationMs, c.explicit FROM c')
        .fetchAll()
        // The tracks table is optional: without it the length-based stats are just empty.
        .catch(() => ({ resources: [] as Array<{ id: string } & TrackMeta> })),
    ]);

    const meta = new Map<string, TrackMeta>(
      tracks.resources.map((t) => [t.id, { durationMs: t.durationMs, explicit: t.explicit }])
    );
    const body = computeMusicStats(events.resources, meta);
    cached = { at: Date.now(), body };

    context.log(`[music-stats] events=${events.resources.length} tracks=${tracks.resources.length}`);
    return { jsonBody: body, headers };
  } catch (err) {
    context.error('[music-stats] failed:', err);
    return { status: 500, jsonBody: { error: String(err) } };
  }
}

app.http('music-stats', {
  methods: ['GET'],
  route: 'music-stats',
  authLevel: 'anonymous',
  handler: musicStatsHandler,
});
