import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { requireAuth } from '../shared/auth';
import { CosmosClient } from '@azure/cosmos';
import { mergeTrackMeta, sanitiseTrackMeta } from '../shared/trackMeta';

interface TrackDoc {
  id: string;
  durationMs: number | null;
  explicit: boolean | null;
  updatedAt: number;
}

// Desktops report the lengths and explicit flags they already look up for the
// queue, so the music stats can show airtime without a lookup of their own.
export async function trackMetaHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const connStr = process.env['COSMOS_CONNECTION_STRING'];
  const dbName = process.env['COSMOS_DATABASE'] ?? 'truetunes';
  const tracksName = process.env['COSMOS_TRACKS_CONTAINER'] ?? 'tracks';

  if (!connStr) {
    return { status: 500, jsonBody: { error: 'Cosmos not configured' } };
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { status: 400, jsonBody: { error: 'Invalid JSON' } };
  }
  const tracks = sanitiseTrackMeta((body as { tracks?: unknown } | null)?.tracks);
  if (tracks.length === 0) return { jsonBody: { saved: 0 } };

  try {
    const ctr = new CosmosClient(connStr).database(dbName).container(tracksName);
    let saved = 0;
    for (const t of tracks) {
      const { resource: existing } = await ctr.item(t.uri, t.uri).read<TrackDoc>();
      const next = mergeTrackMeta(existing, t);
      if (existing && existing.durationMs === next.durationMs && existing.explicit === next.explicit) continue;
      await ctr.items.upsert<TrackDoc>({ id: t.uri, ...next, updatedAt: Date.now() });
      saved += 1;
    }
    return { jsonBody: { saved } };
  } catch (err) {
    context.error('[track-meta] failed:', err);
    return { status: 500, jsonBody: { error: String(err) } };
  }
}

app.http('track-meta', {
  methods: ['POST'],
  route: 'track-meta',
  authLevel: 'anonymous',
  handler: requireAuth(trackMetaHandler),
});
