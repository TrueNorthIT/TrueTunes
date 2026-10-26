/**
 * The DJ auto-queue, as a service the Azure handler (functions/dj-autoplay.ts)
 * wraps. All I/O comes in through `DjAutoplayDeps`, so the whole day-long
 * behaviour can be driven in tests with in-memory stores and an injected clock.
 *
 * The rule it exists to keep: the DJ never queues the same song twice in a London
 * day, and never queues a song someone already queued by hand that day. A song is
 * identified by `trackKey()` (name + artist), not uri, because Sonos re-keys uris.
 * Two sources feed the "used today" set:
 *   - the day ledger (djDayLedger.ts): every key the DJ has enqueued, in any group;
 *   - today's events: songs people queued by hand.
 * The DJ's taste model, by contrast, learns from ALL-TIME history.
 */

import type { RawEvent } from './aggregate';
import { buildDjSet, type DjTrack } from './dj';
import { londonDayKey, londonDayStartMs } from './djDay';
import { readUsedTrackKeys, reserveTrackKey, type DocStore } from './djDayLedger';
import { decideAutoplay, emptySession, trackKey, type DjSession } from './autoplay';

export interface TimedEvent extends RawEvent {
  timestamp?: number;
}

/** Request body of POST /api/dj/autoplay. */
export interface AutoplayBody {
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

/** Response body of POST /api/dj/autoplay. */
export interface AutoplayResponse {
  enabled: boolean;
  leaseHeld: boolean;
  enqueue: DjTrack | null;
  upcoming: DjTrack[];
  fillerUri: string | null;
}

export interface DjAutoplayDeps {
  /**
   * HEAVY: every queued-track event, ALL TIME (no window). The service caches the
   * result for a few minutes instead of calling this on every poll.
   */
  fetchHistory(): Promise<TimedEvent[]>;
  /**
   * CHEAP: events with `timestamp >= sinceMs`. Called with `londonDayStartMs(now())`
   * on every poll, uncached, to learn which songs people have hand-queued today.
   */
  fetchEventsSince(sinceMs: number): Promise<TimedEvent[]>;
  /** DjSession documents, id = Sonos groupId, ETag concurrency. */
  sessions: DocStore;
  /** The day ledger (djDayLedger.ts). May be the same container as `sessions`. */
  ledger: DocStore;
  /** Injected clock. The service never reads Date.now() itself. */
  now(): number;
}

export interface DjAutoplayService {
  handle(body: AutoplayBody): Promise<AutoplayResponse>;
}

/**
 * How long the all-time history is reused. Tastes move over weeks, not minutes, so
 * five minutes costs nothing in quality while turning one heavy scan per poll per
 * client into one per few minutes per host.
 */
const HISTORY_TTL_MS = 5 * 60_000;

/** Who counts as "in the office" when the caller doesn't say. */
const ACTIVE_MS = 4 * 60 * 60_000;

/** Enough candidates that the preview can still fill after exclusions. */
const CANDIDATE_POOL = 40;

/**
 * Below this many one-per-artist candidates the pool is running dry (a long day
 * has used up most songs), so widen to several songs per artist rather than stall.
 */
const THIN_POOL = 8;
const WIDE_POOL = 120;
const WIDE_PER_ARTIST = 8;

/** Session and ledger writes both retry on conflict; this bounds a pile-up. */
const MAX_ATTEMPTS = 10;

/**
 * One instance = one function-host process: the history cache lives inside it.
 * Everything durable lives in the stores, so a second instance over the same
 * stores behaves as a restart.
 */
export function createDjAutoplayService(deps: DjAutoplayDeps): DjAutoplayService {
  let historyCache: { fetchedAt: number; events: Promise<TimedEvent[]> } | undefined;

  function history(now: number): Promise<TimedEvent[]> {
    if (!historyCache || now - historyCache.fetchedAt >= HISTORY_TTL_MS) {
      const entry = { fetchedAt: now, events: deps.fetchHistory() };
      historyCache = entry;
      // Don't keep a failure for five minutes; let the next poll try again.
      entry.events.catch(() => {
        if (historyCache === entry) historyCache = undefined;
      });
    }
    return historyCache.events;
  }

  async function handle(body: AutoplayBody): Promise<AutoplayResponse> {
    const now = deps.now();
    const groupId = body.groupId as string;
    const clientId = body.clientId as string;

    // Both arrays must stay index-aligned: the coordinator compares positions to
    // decide whether the playhead has passed the filler.
    const queueUris = Array.isArray(body.queueUris) ? body.queueUris : [];
    const queueKeys = Array.isArray(body.queueKeys) ? body.queueKeys : [];

    const dayStart = londonDayStartMs(now);
    const [events, today] = await Promise.all([history(now), deps.fetchEventsSince(dayStart)]);

    // An 'album' row carries the album name as its trackName, so it would look
    // like a hand-queued song. The album's tracks are logged as their own rows.
    const used = new Set(today.filter((e) => e.eventType !== 'album').map((e) => trackKey(e.trackName, e.artist)));
    for (const key of await readUsedTrackKeys(deps.ledger, now)) used.add(key);

    // Same room inference the DJ panel uses when the caller doesn't say who's in.
    // Today's rows cover the last four hours except just after midnight.
    let users = body.users?.filter(Boolean) ?? [];
    if (users.length === 0) {
      const activeSince = now - ACTIVE_MS;
      const recent = dayStart > activeSince ? events : today;
      users = [...new Set(recent.filter((e) => (e.timestamp ?? 0) >= activeSince && e.userId).map((e) => e.userId))];
    }

    // Seeded by the London day: the opener varies day to day but holds all day (#104).
    const base = { users, excludeUris: queueUris, excludeTrackKeys: used, seed: londonDayKey(now) };
    let candidates = buildDjSet(events, { ...base, limit: CANDIDATE_POOL, perArtistMax: 1 }).tracks;
    if (candidates.length < THIN_POOL) {
      candidates = buildDjSet(events, {
        ...base,
        limit: WIDE_POOL,
        perArtistMax: WIDE_PER_ARTIST,
      }).tracks;
    }

    // Keys this call has already reserved, so a retry after a session conflict
    // doesn't try to reserve the same pick a second time and read that as "taken".
    const reserved = new Set<string>();

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const current = await deps.sessions.read<DjSession>(groupId);
      // The session's own recentlyPlayed list is dropped on purpose: within a day
      // the ledger already remembers every pick (by name, which is stronger), and
      // carrying uris over would stop yesterday's songs coming back after midnight.
      const session = { ...(current ?? emptySession(groupId)), recentlyPlayed: [] };
      const decision = decideAutoplay(
        session,
        {
          clientId,
          queueUris,
          queueKeys,
          nowPlayingUri: body.nowPlayingUri ?? null,
          nowPlayingKey: body.nowPlayingKey ?? null,
          nowPlayingIndex: typeof body.nowPlayingIndex === 'number' ? body.nowPlayingIndex : null,
          candidates,
          usedKeys: used,
          ...(body.setEnabled !== undefined ? { setEnabled: body.setEnabled } : {}),
        },
        now
      );

      // Reserve BEFORE the session write and before telling anyone to enqueue.
      // If another group got this song first, drop it and decide again — both the
      // preview and the candidates skip anything in `used`.
      if (decision.enqueue) {
        const key = trackKey(decision.enqueue.trackName, decision.enqueue.artist);
        if (!reserved.has(key)) {
          if (!(await reserveTrackKey(deps.ledger, now, key))) {
            used.add(key);
            continue;
          }
          reserved.add(key);
        }
      }

      try {
        if (current?._etag) await deps.sessions.replace(decision.session, current._etag);
        else await deps.sessions.create(decision.session);
      } catch (err) {
        // Two clients polling at once both read the same lease; the loser's write
        // fails here and its retry sees the winner's session.
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 412 || code === 409) continue;
        throw err;
      }

      return {
        enabled: decision.session.enabled,
        leaseHeld: decision.leaseHeld,
        enqueue: decision.enqueue,
        upcoming: decision.upcoming,
        fillerUri: decision.fillerUri,
      };
    }
    throw new Error('autoplay session contention — max retries exceeded');
  }

  return { handle };
}
