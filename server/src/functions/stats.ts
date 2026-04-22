import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { CosmosClient } from '@azure/cosmos';
import { aggregateEvents, RawEvent } from '../shared/aggregate';

type Period = 'today' | 'week' | 'alltime';

function periodStartMs(period: Period): number {
  if (period === 'today') {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  if (period === 'week') return Date.now() - 7 * 24 * 60 * 60 * 1000;
  return 0;
}

export async function statsHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const connStr = process.env['COSMOS_CONNECTION_STRING'];
  const dbName = process.env['COSMOS_DATABASE'] ?? 'truetunes';
  const ctrName = process.env['COSMOS_CONTAINER'] ?? 'events';

  if (!connStr) {
    return { status: 500, jsonBody: { error: 'Cosmos not configured' } };
  }

  const period = (request.query.get('period') ?? 'alltime') as Period;
  const userId = request.query.get('userId') ?? undefined;
  const startMs = periodStartMs(period);

  try {
    const client = new CosmosClient(connStr);
    const container = client.database(dbName).container(ctrName);

    const conditions: string[] = [];
    const parameters: { name: string; value: string | number }[] = [];
    if (startMs > 0) { conditions.push('c.timestamp >= @start'); parameters.push({ name: '@start', value: startMs }); }
    if (userId)       { conditions.push('c.userId = @userId');    parameters.push({ name: '@userId', value: userId }); }
    const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
    const query = {
      query: `SELECT c.userId, c.trackName, c.artist, c.artistId, c.album, c.albumId, c.imageUrl, c.uri FROM c${where}`,
      parameters,
    };

    const { resources } = await container.items.query<RawEvent>(query).fetchAll();

    const { trackMap, artistMap, albumMap, userCounts } = aggregateEvents(resources);

    const topUsers = Object.entries(userCounts)
      .map(([userId, count]) => ({ userId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topTracks = Object.values(trackMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(({ key: _key, ...rest }) => rest);

    const topArtists = Object.values(artistMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topAlbums = Object.values(albumMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(({ key: _key, ...rest }) => rest);

    context.log(`[stats] period=${period} events=${resources.length}`);

    return {
      jsonBody: { topUsers, topTracks, topArtists, topAlbums, totalEvents: resources.length, periodStart: startMs },
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    context.error('[stats] query failed:', err);
    return { status: 500, jsonBody: { error: String(err) } };
  }
}

app.http('stats', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: statsHandler,
});
