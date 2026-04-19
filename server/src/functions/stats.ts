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
  artistId?: string;
  album?: string;
  albumId?: string;
  imageUrl?: string;
  uri?: string;
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

    const { resources } = await container.items
      .query<RawEvent>(query)
      .fetchAll();

    // Aggregate in-process — fine at POC scale
    const userCounts: Record<string, number> = {};
    const trackMap: Record<string, { trackName: string; artist: string; artistId?: string; album?: string; albumId?: string; imageUrl?: string; uri?: string; count: number }> = {};
    const artistMap: Record<string, { artistId?: string; count: number }> = {};
    const albumMap: Record<string, { albumId?: string; album: string; artist: string; artistId?: string; imageUrl?: string; count: number }> = {};

    for (const e of resources) {
      if (e.userId) userCounts[e.userId] = (userCounts[e.userId] ?? 0) + 1;
      if (e.artist) {
        if (!artistMap[e.artist]) artistMap[e.artist] = { artistId: e.artistId ?? undefined, count: 0 };
        else if (!artistMap[e.artist].artistId && e.artistId) artistMap[e.artist].artistId = e.artistId;
        artistMap[e.artist].count++;
      }
      if (e.album) {
        const albumKey = e.albumId ?? e.album;
        if (!albumMap[albumKey]) albumMap[albumKey] = { albumId: e.albumId ?? undefined, album: e.album, artist: e.artist, artistId: e.artistId ?? undefined, imageUrl: e.imageUrl ?? undefined, count: 0 };
        else {
          if (!albumMap[albumKey].albumId && e.albumId) albumMap[albumKey].albumId = e.albumId;
          if (!albumMap[albumKey].artistId && e.artistId) albumMap[albumKey].artistId = e.artistId;
          if (!albumMap[albumKey].imageUrl && e.imageUrl) albumMap[albumKey].imageUrl = e.imageUrl;
        }
        albumMap[albumKey].count++;
      }
      const key = `${e.trackName}||${e.artist}`;
      if (!trackMap[key]) {
        trackMap[key] = { trackName: e.trackName, artist: e.artist, artistId: e.artistId ?? undefined, album: e.album ?? undefined, albumId: e.albumId ?? undefined, imageUrl: e.imageUrl ?? undefined, uri: e.uri, count: 0 };
      } else {
        if (!trackMap[key].artistId && e.artistId) trackMap[key].artistId = e.artistId;
        if (!trackMap[key].album && e.album) trackMap[key].album = e.album;
        if (!trackMap[key].albumId && e.albumId) trackMap[key].albumId = e.albumId;
        if (!trackMap[key].imageUrl && e.imageUrl) trackMap[key].imageUrl = e.imageUrl;
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

    const topArtists = Object.entries(artistMap)
      .map(([artist, { artistId, count }]) => ({ artist, artistId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topAlbums = Object.values(albumMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

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
