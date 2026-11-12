// The TrueTunes Azure Functions (server/ in this repo): attribution, leaderboard and profiles.
// Queued events go to log-event (the durable record behind the leaderboard) and, best effort, to the
// office Web PubSub group so desktop clients show the "queued by" badge straight away.

import WebSocket from 'ws';
import { env } from './env';
import { errorText, log, since } from './log';

async function fn<T>(
  path: string,
  init: RequestInit & { query?: Record<string, string | number | undefined> } = {}
): Promise<T> {
  const url = new URL(`${env.functionsUrl()}/api/${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`TrueTunes ${path} → ${res.status}`);
  return (await res.json()) as T;
}

export type AttributionMap = Record<string, { user: string; timestamp: number; trackName: string; artist: string }>;

/** Who queued what, last 24 hours, keyed by track objectId. Empty if the Functions are unreachable. */
export async function attribution(): Promise<AttributionMap> {
  try {
    return await fn<AttributionMap>('attribution');
  } catch (err) {
    log.warn('attribution', 'lookup unavailable', { error: errorText(err) });
    return {};
  }
}

export interface Stats {
  topUsers: Array<{ userId: string; count: number }>;
  topTracks: Array<{ trackName: string; artist: string; count: number }>;
  topArtists: Array<{ artist: string; count: number }>;
  topAlbums: Array<{ album: string; artist: string; count: number }>;
  totalEvents: number;
}

export function stats(period: 'today' | 'week' | 'alltime', count: number): Promise<Stats> {
  return fn<Stats>('stats', { query: { period, count } });
}

/** The display name this Entra account has claimed in TrueTunes, or null. */
export async function lookupDisplayName(oid: string): Promise<string | null> {
  const url = new URL(`${env.functionsUrl()}/api/profile/lookup`);
  url.searchParams.set('oid', oid);
  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`TrueTunes profile/lookup → ${res.status}`);
  const body = (await res.json()) as { displayName?: string };
  return body.displayName ?? null;
}

export interface QueuedItem {
  eventType: 'track' | 'album';
  uri: string;
  trackName: string;
  artist: string;
  serviceId?: string;
  accountId?: string;
  artistId?: string;
  album?: string;
  albumId?: string;
  imageUrl?: string;
}

type QueuedEvent = QueuedItem & { type: 'queued'; user: string; timestamp: number };

const authHeader = (idToken?: string): Record<string, string> =>
  idToken ? { Authorization: `Bearer ${idToken}` } : {};

async function logEvent(event: QueuedEvent, idToken?: string): Promise<void> {
  const res = await fetch(`${env.functionsUrl()}/api/log-event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader(idToken) },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`log-event → ${res.status} ${await res.text().catch(() => '')}`);
}

/** Sends the events to the office Web PubSub group (hub/group "office"), as src/pubsub.ts does. */
async function broadcast(events: QueuedEvent[], user: string, idToken?: string): Promise<void> {
  const { webPubSubUrl } = await fn<{ webPubSubUrl: string }>('connect', {
    method: 'POST',
    headers: authHeader(idToken),
    query: { username: user },
  });
  const ws = new WebSocket(webPubSubUrl, 'json.webpubsub.azure.v1');
  await new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* closed */
      }
      resolve();
    };
    const timer = setTimeout(done, 5_000);
    const lastAck = events.length;
    ws.on('error', done);
    ws.on('open', () => {
      events.forEach((data, i) =>
        ws.send(
          JSON.stringify({ type: 'sendToGroup', group: 'office', dataType: 'json', noEcho: true, ackId: i + 1, data })
        )
      );
    });
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type?: string; ackId?: number };
        if (msg.type === 'ack' && msg.ackId === lastAck) done();
      } catch {
        /* not ours */
      }
    });
  });
}

/** Credits queued items to `user` on the leaderboard and live badges. Never throws. */
export async function publishQueued(items: QueuedItem[], user: string, idToken?: string): Promise<void> {
  const now = Date.now();
  const events: QueuedEvent[] = items
    .filter((i) => i.uri)
    .map((i, n) => ({ ...i, type: 'queued', user, timestamp: now + n }));
  if (!events.length) return;
  const started = Date.now();
  const [live, ...logged] = await Promise.allSettled([
    broadcast(events, user, idToken),
    ...events.map((e) => logEvent(e, idToken)),
  ]);
  const failed = logged.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
  const fields = {
    user,
    events: events.length,
    logged: logged.length - failed.length,
    failed: failed.length || undefined,
    live: live.status === 'fulfilled' ? 'sent' : `failed: ${errorText(live.reason)}`,
    token: idToken ? 'entra' : 'none',
    ms: since(started),
    error: failed[0] ? errorText(failed[0].reason) : undefined,
  };
  if (failed.length || live.status === 'rejected') log.warn('attribution', 'published with errors', fields);
  else log.info('attribution', 'published', fields);
}
