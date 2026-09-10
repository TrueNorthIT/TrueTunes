import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { CosmosClient, Container } from '@azure/cosmos';
import { buildDjSet } from '../shared/dj';
import { decideAutoplay, emptySession, type DjSession } from '../shared/autoplay';
import type { RawEvent } from '../shared/aggregate';

const WINDOW_DAYS = 90;
const ACTIVE_HOURS = 4;
/** Enough candidates that the preview can still fill after exclusions. */
const CANDIDATE_POOL = 40;

interface TimedEvent extends RawEvent {
  timestamp?: number;
}

interface AutoplayBody {
  groupId?: string;
  clientId?: string;
  queueUris?: string[];
  /** Name-based identity per queue entry, for when Sonos re-keys objectIds. */
  queueKeys?: string[];
  nowPlayingUri?: string | null;
  nowPlayingKey?: string | null;
  nowPlayingIndex?: number | null;
  users?: string[];
  setEnabled?: boolean;
}

/**
 * Read-modify-write the session under optimistic concurrency.
 *
 * The ETag is what makes the lease safe: two clients polling at the same instant
 * both read `leaseOwner: null` and both try to claim it. Cosmos fails the second
 * write with 412, and the retry re-reads a session that already has an owner, so
 * only one client is ever told to enqueue.
 */
async function updateSession(
  container: Container,
  id: string,
  apply: (session: DjSession) => DjSession,
  maxRetries = 4,
): Promise<DjSession> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let current: DjSession | undefined;
    try {
      const read = await container.item(id, id).read<DjSession>();
      current = read.resource;
    } catch {
      current = undefined;
    }

    const base = current ?? emptySession(id);
    const updated = apply(base);

    try {
      if (current?._etag) {
        await container
          .item(id, id)
          .replace(updated, { accessCondition: { type: 'IfMatch', condition: current._etag } });
      } else {
        // No document yet. `create` fails with 409 if another client won the
        // race, which the retry then reads and builds on.
        await container.items.create(updated);
      }
      return updated;
    } catch (err) {
      const code = (err as { code?: number; statusCode?: number }).statusCode
        ?? (err as { code?: number }).code;
      if ((code === 412 || code === 409) && attempt < maxRetries - 1) continue;
      throw err;
    }
  }
  throw new Error('autoplay session contention — max retries exceeded');
}

export async function djAutoplayHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const headers = { 'Access-Control-Allow-Origin': '*' };
  const connStr = process.env['COSMOS_CONNECTION_STRING'];
  const dbName = process.env['COSMOS_DATABASE'] ?? 'truetunes';
  const eventsCtr = process.env['COSMOS_CONTAINER'] ?? 'events';
  const sessionsCtr = process.env['COSMOS_SESSIONS_CONTAINER'] ?? 'sessions';

  if (!connStr) return { status: 500, jsonBody: { error: 'Cosmos not configured' }, headers };

  let body: AutoplayBody;
  try {
    body = (await request.json()) as AutoplayBody;
  } catch {
    return { status: 400, jsonBody: { error: 'Invalid JSON body' }, headers };
  }

  const groupId = body.groupId?.trim();
  const clientId = body.clientId?.trim();
  if (!groupId || !clientId) {
    return { status: 400, jsonBody: { error: 'groupId and clientId are required' }, headers };
  }

  // Both arrays must stay index-aligned: the coordinator compares positions to
  // decide whether the playhead has passed the filler. Dropping empty entries
  // from one and not the other would shift every index after the gap.
  const queueUris = Array.isArray(body.queueUris) ? body.queueUris : [];
  const queueKeys = Array.isArray(body.queueKeys) ? body.queueKeys : [];
  const nowPlayingUri = body.nowPlayingUri ?? null;
  const nowPlayingKey = body.nowPlayingKey ?? null;
  const nowPlayingIndex =
    typeof body.nowPlayingIndex === 'number' ? body.nowPlayingIndex : null;

  try {
    const client = new CosmosClient(connStr);
    const db = client.database(dbName);

    const startMs = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const { resources: events } = await db
      .container(eventsCtr)
      .items.query<TimedEvent>({
        query:
          'SELECT c.userId, c.eventType, c.trackName, c.artist, c.artistId, c.album, c.albumId, c.imageUrl, c.uri, c.serviceId, c.accountId, c.timestamp FROM c WHERE c.timestamp >= @start',
        parameters: [{ name: '@start', value: startMs }],
      })
      .fetchAll();

    // Same room inference the DJ panel uses when the caller doesn't say who's in.
    let users = body.users?.filter(Boolean) ?? [];
    if (users.length === 0) {
      const activeSince = Date.now() - ACTIVE_HOURS * 60 * 60 * 1000;
      users = [
        ...new Set(
          events.filter((e) => (e.timestamp ?? 0) >= activeSince && e.userId).map((e) => e.userId),
        ),
      ];
    }

    const { tracks: candidates } = buildDjSet(events, {
      users,
      limit: CANDIDATE_POOL,
      excludeUris: queueUris,
      // One per artist: the preview shows three in a row, and three tracks by
      // the same act reads as a broken shuffle rather than a DJ set.
      perArtistMax: 1,
    });

    let decision!: ReturnType<typeof decideAutoplay>;
    await updateSession(db.container(sessionsCtr), groupId, (session) => {
      decision = decideAutoplay(session, {
        clientId,
        queueUris,
        queueKeys,
        nowPlayingUri,
        nowPlayingKey,
        nowPlayingIndex,
        candidates,
        ...(body.setEnabled !== undefined ? { setEnabled: body.setEnabled } : {}),
      });
      return decision.session;
    });

    if (decision.enqueue) {
      context.log(
        `[dj-autoplay] group=${groupId} client=${clientId} enqueue=${decision.enqueue.artist} — ${decision.enqueue.trackName}`,
      );
    }

    return {
      status: 200,
      jsonBody: {
        enabled: decision.session.enabled,
        leaseHeld: decision.leaseHeld,
        enqueue: decision.enqueue,
        upcoming: decision.upcoming,
        fillerUri: decision.fillerUri,
      },
      headers,
    };
  } catch (err) {
    context.error('[dj-autoplay] failed:', err);
    return { status: 500, jsonBody: { error: String(err) }, headers };
  }
}

app.http('dj-autoplay', {
  route: 'dj/autoplay',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: djAutoplayHandler,
});
