import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { CosmosClient } from '@azure/cosmos';

const WINDOW_MS = 24 * 60 * 60 * 1000;

export async function attributionHandler(
  _request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const connStr = process.env['COSMOS_CONNECTION_STRING'];
  const dbName = process.env['COSMOS_DATABASE'] ?? 'truetunes';
  const ctrName = process.env['COSMOS_CONTAINER'] ?? 'events';

  if (!connStr) {
    return { status: 500, jsonBody: { error: 'Cosmos not configured' } };
  }

  const sinceMs = Date.now() - WINDOW_MS;

  try {
    const client = new CosmosClient(connStr);
    const container = client.database(dbName).container(ctrName);

    // Fetch recent track events ordered oldest-first so later events overwrite
    // earlier ones when we fold into the map — most recent attribution wins.
    const { resources } = await container.items
      .query<{
        uri: string;
        userId: string;
        timestamp: number;
        trackName: string;
        artist: string;
      }>({
        query:
          'SELECT c.uri, c.userId, c.timestamp, c.trackName, c.artist ' +
          'FROM c WHERE c.timestamp >= @since AND c.eventType != \'album\' ' +
          'ORDER BY c.timestamp ASC',
        parameters: [{ name: '@since', value: sinceMs }],
      })
      .fetchAll();

    const map: Record<string, { user: string; timestamp: number; trackName: string; artist: string }> = {};
    for (const r of resources) {
      if (r.uri) {
        map[r.uri] = { user: r.userId, timestamp: r.timestamp, trackName: r.trackName, artist: r.artist };
      }
    }

    context.log(`[attribution] sinceMs=${sinceMs} events=${resources.length} uris=${Object.keys(map).length}`);

    return {
      jsonBody: map,
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    context.error('[attribution] query failed:', err);
    return { status: 500, jsonBody: { error: String(err) } };
  }
}

app.http('attribution', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: attributionHandler,
});
