import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { CosmosClient } from '@azure/cosmos';

interface RawQueuedDoc {
  uri: string;
  serviceId: string | null;
  accountId: string | null;
  trackName: string;
  artist: string;
  album: string | null;
  imageUrl: string | null;
  timestamp: number;
  userId: string;
}

interface RecentQueuedTrack {
  uri: string;
  serviceId: string;
  accountId: string;
  trackName: string;
  artist: string;
  album?: string;
  imageUrl?: string;
  timestamp: number;
  queuedBy: string;
}

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;
const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function recentQueuedHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const connStr = process.env['COSMOS_CONNECTION_STRING'];
  const dbName = process.env['COSMOS_DATABASE'] ?? 'truetunes';
  const ctrName = process.env['COSMOS_CONTAINER'] ?? 'events';

  if (!connStr) {
    return { status: 500, jsonBody: { error: 'Cosmos not configured' } };
  }

  const sinceParam = Number(request.query.get('sinceMs'));
  const sinceMs = Number.isFinite(sinceParam) && sinceParam > 0
    ? sinceParam
    : Date.now() - DEFAULT_WINDOW_MS;

  const limitParam = Number(request.query.get('limit'));
  const limit = Math.min(
    Number.isFinite(limitParam) && limitParam > 0 ? limitParam : DEFAULT_LIMIT,
    MAX_LIMIT,
  );

  try {
    const client = new CosmosClient(connStr);
    const container = client.database(dbName).container(ctrName);

    const query = {
      query:
        "SELECT c.uri, c.serviceId, c.accountId, c.trackName, c.artist, c.album, c.imageUrl, c.timestamp, c.userId " +
        "FROM c WHERE c.timestamp >= @since AND c.eventType = 'track' " +
        'ORDER BY c.timestamp ASC',
      parameters: [{ name: '@since', value: sinceMs }],
    };

    const { resources } = await container.items.query<RawQueuedDoc>(query).fetchAll();

    const seen = new Map<string, RecentQueuedTrack>();
    for (const r of resources) {
      if (!r.uri || !r.serviceId || !r.accountId) continue;
      if (seen.has(r.uri)) continue;
      seen.set(r.uri, {
        uri: r.uri,
        serviceId: r.serviceId,
        accountId: r.accountId,
        trackName: r.trackName,
        artist: r.artist,
        album: r.album ?? undefined,
        imageUrl: r.imageUrl ?? undefined,
        timestamp: r.timestamp,
        queuedBy: r.userId,
      });
      if (seen.size >= limit) break;
    }

    const tracks = [...seen.values()];
    context.log(`[recent-queued] sinceMs=${sinceMs} raw=${resources.length} unique=${tracks.length}`);

    return {
      jsonBody: { tracks },
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    context.error('[recent-queued] query failed:', err);
    return { status: 500, jsonBody: { error: String(err) } };
  }
}

app.http('recent-queued', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: recentQueuedHandler,
});
