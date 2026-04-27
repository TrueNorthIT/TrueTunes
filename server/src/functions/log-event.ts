import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { CosmosClient } from '@azure/cosmos';

interface QueueEvent {
  type: 'queued';
  eventType?: 'track' | 'album';
  user: string;
  uri: string;
  trackName: string;
  artist: string;
  serviceId?: string;
  accountId?: string;
  artistId?: string;
  album?: string;
  albumId?: string;
  imageUrl?: string;
  timestamp: number;
}

export async function logEventHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const connStr = process.env['COSMOS_CONNECTION_STRING'];
  const dbName = process.env['COSMOS_DATABASE'] ?? 'truetunes';
  const ctrName = process.env['COSMOS_CONTAINER'] ?? 'events';

  if (!connStr) {
    return { status: 500, jsonBody: { error: 'Cosmos not configured' } };
  }

  let body: QueueEvent;
  try {
    body = (await request.json()) as QueueEvent;
  } catch {
    return { status: 400, jsonBody: { error: 'Invalid JSON body' } };
  }

  if (!body?.user || !body?.uri || body?.type !== 'queued') {
    return { status: 400, jsonBody: { error: 'Missing required fields' } };
  }

  try {
    const client = new CosmosClient(connStr);
    const container = client.database(dbName).container(ctrName);

    const suffix = Math.random().toString(16).slice(2, 9);
    const id = `${new Date(body.timestamp).toISOString()}::${suffix}`;

    await container.items.create({
      id,
      userId: body.user,
      eventType: body.eventType ?? null,
      uri: body.uri,
      trackName: body.trackName,
      artist: body.artist,
      serviceId: body.serviceId ?? null,
      accountId: body.accountId ?? null,
      artistId: body.artistId ?? null,
      album: body.album ?? null,
      albumId: body.albumId ?? null,
      imageUrl: body.imageUrl ?? null,
      timestamp: body.timestamp,
    });

    context.log(`[log-event] ${id} user=${body.user} track=${body.trackName}`);
    return { status: 201, jsonBody: { id }, headers: { 'Access-Control-Allow-Origin': '*' } };
  } catch (err) {
    context.error('[log-event] Cosmos write failed:', err);
    return { status: 500, jsonBody: { error: String(err) } };
  }
}

app.http('log-event', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: logEventHandler,
});
