import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { requireAuth } from '../shared/auth';
import { CosmosClient } from '@azure/cosmos';
import { containerDocStore, eventsSinceQuery, historyQuery } from '../shared/cosmosAdapters';
import {
  createDjAutoplayService,
  type AutoplayBody,
  type DjAutoplayService,
  type TimedEvent,
} from '../shared/djAutoplayService';

let service: DjAutoplayService | undefined;

/**
 * The one service for this function host. It must outlive a single request: its
 * all-time history cache is what stops every poll from rescanning the events
 * container. Everything durable lives in Cosmos, so a host restart loses nothing.
 */
export function getDjAutoplayService(connStr: string): DjAutoplayService {
  if (!service) {
    const db = new CosmosClient(connStr).database(process.env['COSMOS_DATABASE'] ?? 'truetunes');
    const events = db.container(process.env['COSMOS_CONTAINER'] ?? 'events');
    // The day ledger shares the sessions container (partition /id): one document
    // per London day beside the per-group sessions, so no new infrastructure.
    const sessions = containerDocStore(db.container(process.env['COSMOS_SESSIONS_CONTAINER'] ?? 'sessions'));
    service = createDjAutoplayService({
      fetchHistory: async () => (await events.items.query<TimedEvent>(historyQuery()).fetchAll()).resources,
      fetchEventsSince: async (sinceMs) =>
        (await events.items.query<TimedEvent>(eventsSinceQuery(sinceMs)).fetchAll()).resources,
      sessions,
      ledger: sessions,
      now: () => Date.now(),
    });
  }
  return service;
}

export function createDjAutoplayHandler(resolveService: (connStr: string) => DjAutoplayService) {
  return async function djAutoplayHandler(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const connStr = process.env['COSMOS_CONNECTION_STRING'];

    if (!connStr) return { status: 500, jsonBody: { error: 'Cosmos not configured' } };

    let body: AutoplayBody;
    try {
      body = (await request.json()) as AutoplayBody;
    } catch {
      return { status: 400, jsonBody: { error: 'Invalid JSON body' } };
    }

    const groupId = body.groupId?.trim();
    const clientId = body.clientId?.trim();
    if (!groupId || !clientId) {
      return { status: 400, jsonBody: { error: 'groupId and clientId are required' } };
    }

    try {
      const result = await resolveService(connStr).handle({ ...body, groupId, clientId });

      if (result.enqueue) {
        context.log(
          `[dj-autoplay] group=${groupId} client=${clientId} enqueue=${result.enqueue.artist} — ${result.enqueue.trackName}`
        );
      }

      return { status: 200, jsonBody: result };
    } catch (err) {
      context.error('[dj-autoplay] failed:', err);
      return { status: 500, jsonBody: { error: String(err) } };
    }
  };
}

export const djAutoplayHandler = createDjAutoplayHandler(getDjAutoplayService);

app.http('dj-autoplay', {
  route: 'dj/autoplay',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: requireAuth(djAutoplayHandler),
});
