import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { CosmosClient } from '@azure/cosmos';

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

interface RawEvent {
  userId: string;
  trackName: string;
  artist: string;
  album?: string;
  imageUrl?: string;
  uri?: string;
  serviceId?: string;
  accountId?: string;
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
  const startMs = periodStartMs(period);

  try {
    const client = new CosmosClient(connStr);
    const container = client.database(dbName).container(ctrName);

    const query = startMs > 0
      ? { query: 'SELECT c.userId, c.trackName, c.artist, c.album, c.imageUrl, c.serviceId, c.accountId, c.uri FROM c WHERE c.timestamp >= @start', parameters: [{ name: '@start', value: startMs }] }
      : { query: 'SELECT c.userId, c.trackName, c.artist, c.album, c.imageUrl, c.serviceId, c.accountId, c.uri FROM c' };

    const { resources } = await container.items
      .query<RawEvent>(query)
      .fetchAll();

    // Aggregate in-process — fine at POC scale
    const userCounts: Record<string, number> = {};
    const trackMap: Record<string, { trackName: string; artist: string; album?: string; imageUrl?: string; uri?: string; serviceId?: string; accountId?: string; count: number }> = {};
    const artistCounts: Record<string, number> = {};

    for (const e of resources) {
      if (e.userId) userCounts[e.userId] = (userCounts[e.userId] ?? 0) + 1;
      if (e.artist) artistCounts[e.artist] = (artistCounts[e.artist] ?? 0) + 1;
      const key = `${e.trackName}||${e.artist}`;
      if (!trackMap[key]) {
        trackMap[key] = { trackName: e.trackName, artist: e.artist, album: e.album, imageUrl: e.imageUrl, uri: e.uri, serviceId: e.serviceId, accountId: e.accountId, count: 0 };
      }
      trackMap[key].count++;
    }

    const topUsers = Object.entries(userCounts)
      .map(([userId, count]) => ({ userId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topTracks = Object.values(trackMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topArtists = Object.entries(artistCounts)
      .map(([artist, count]) => ({ artist, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    context.log(`[stats] period=${period} events=${resources.length}`);

    return {
      jsonBody: { topUsers, topTracks, topArtists, totalEvents: resources.length, periodStart: startMs },
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
