/**
 * Autoplay coordination — keeps one DJ-chosen track parked at the tail of the
 * Sonos queue so music never stops, without five clients each adding their own.
 *
 * Why a coordinator at all: the queue lives in Sonos, and only a signed-in
 * desktop client can write to it. Every client can see the queue is about to run
 * dry and would independently append a filler, giving you four copies. So the
 * server owns the decision and hands out a short lease; exactly one client acts
 * on it, and every client renders the same `upcoming` list.
 *
 * Only the HEAD of `upcoming` is ever really in the Sonos queue. The other two
 * are a preview. Parking three real tracks would mean a user queueing something
 * lands behind all of them, and "play this next" would stop meaning anything.
 */

import type { DjTrack } from './dj';

/**
 * Identity that survives Sonos re-keying an objectId (issue #84).
 *
 * A track added by uri can come back from the queue under a different objectId,
 * so uri matching alone can never find the filler again — the coordinator then
 * concludes the add failed and re-parks the same pick forever.
 */
export function trackKey(trackName?: string | null, artist?: string | null): string {
  return `${(trackName ?? '').trim().toLowerCase()}||${(artist ?? '').trim().toLowerCase()}`;
}

/** How long a client may hold the right to enqueue before another may take over. */
export const LEASE_MS = 30_000;

/** How many picks the UI previews below the queue. */
export const UPCOMING_SIZE = 3;

/**
 * How long to wait for a parked filler to show up in someone's queue snapshot
 * before concluding the add failed and trying again.
 *
 * This is a backstop for a genuinely failed add, NOT the mechanism that stops
 * duplicates — `enqueuedSeen` does that, and does it exactly. Cosmos ETags can't
 * help here: the session document is perfectly consistent, it's the client's
 * queue snapshot that's stale, so there's no write conflict to detect.
 */
export const ENQUEUE_TIMEOUT_MS = 60_000;

/**
 * How many played picks to remember. Once a track leaves the queue it's no
 * longer excluded by the queue snapshot, so without this the DJ offers it
 * straight back and the office hears the same handful on a loop.
 */
export const RECENT_MEMORY = 50;

export interface DjSession {
  /** One session per Sonos group. */
  id: string;
  leaseOwner: string | null;
  leaseExpires: number;
  /** The DJ's running order. Head is the one parked in the real queue. */
  upcoming: DjTrack[];
  /** URI this coordinator last told a client to enqueue, if it's still pending. */
  enqueuedUri: string | null;
  /** Name-based identity for the same track, for when the uri gets re-keyed. */
  enqueuedKey: string | null;
  /** When that instruction was issued, for the failed-add backstop. */
  enqueuedAt: number;
  /**
   * Whether any client has actually reported seeing the filler in the queue.
   *
   * Until it's been seen, absence means "the add hasn't landed yet" — Sonos
   * queue reads are eventually consistent and a client can easily report a
   * snapshot older than its own write. Only after it has been seen does absence
   * mean "it played, or someone removed it".
   */
  enqueuedSeen: boolean;
  /** Recently played DJ picks, newest last, so the set doesn't cycle. */
  recentlyPlayed: string[];
  /** Autoplay is opt-in per group, and any client can turn it off for everyone. */
  enabled: boolean;
  updatedAt: number;
  _etag?: string;
}

export interface AutoplayRequest {
  clientId: string;
  /** Track URIs currently in the Sonos queue, in order. */
  queueUris: string[];
  /** `trackKey()` for each queue entry, same order — the re-keying fallback. */
  queueKeys?: string[];
  /** What's playing right now, if anything. */
  nowPlayingUri?: string | null;
  /** `trackKey()` for the playing track, for the same reason. */
  nowPlayingKey?: string | null;
  /**
   * Zero-based position of the playhead in the queue, when the player reports
   * it. This is the reliable signal — Sonos gives the queue item's position
   * directly, whereas objectIds get re-keyed and names can be formatted
   * differently between the event log and the live queue. Used in preference to
   * matching, which stays as the fallback.
   */
  nowPlayingIndex?: number | null;
  /** Fresh DJ candidates, best first — already filtered against the queue. */
  candidates: DjTrack[];
  /** Set to change the group's autoplay setting; omit to leave it alone. */
  setEnabled?: boolean;
}

export interface AutoplayDecision {
  session: DjSession;
  /** Non-null only for the lease holder: add this to the end of the queue. */
  enqueue: DjTrack | null;
  /** Whether this caller holds the lease this round. */
  leaseHeld: boolean;
  /** The preview list every client renders, head first. */
  upcoming: DjTrack[];
  /**
   * URI of the filler sitting at the tail, so clients know to insert user picks
   * ahead of it rather than behind.
   */
  fillerUri: string | null;
}

export function emptySession(id: string): DjSession {
  return {
    id,
    leaseOwner: null,
    leaseExpires: 0,
    upcoming: [],
    enqueuedUri: null,
    enqueuedKey: null,
    enqueuedAt: 0,
    enqueuedSeen: false,
    recentlyPlayed: [],
    enabled: false,
    updatedAt: 0,
  };
}

/**
 * Decide what happens this round. Pure — the caller persists `session` and
 * relays the rest. `now` is injected so the lease behaviour is testable.
 */
export function decideAutoplay(
  session: DjSession,
  req: AutoplayRequest,
  now: number = Date.now(),
): AutoplayDecision {
  const next: DjSession = {
    ...session,
    upcoming: [...session.upcoming],
    recentlyPlayed: [...(session.recentlyPlayed ?? [])],
  };

  if (req.setEnabled !== undefined) next.enabled = req.setEnabled;

  // Lease: free, expired, or already ours. Deliberately not fair — whoever asks
  // first while it's free keeps renewing, which avoids handing the queue back
  // and forth between clients every poll.
  const leaseFree = !next.leaseOwner || next.leaseExpires <= now;
  const leaseHeld = leaseFree || next.leaseOwner === req.clientId;
  if (leaseHeld) {
    next.leaseOwner = req.clientId;
    next.leaseExpires = now + LEASE_MS;
  }

  const inQueue = new Set(req.queueUris);

  // A Sonos queue keeps every track it has ever played — playback is a pointer
  // moving through it, not a consuming read. So "has the filler played?" is a
  // question about position relative to the playhead, never about membership.
  // Look up by uri, then fall back to name+artist. Sonos hands back a different
  // objectId than the one we added, so uri alone loses track of the filler.
  const keys = req.queueKeys ?? [];
  const locate = (uri: string | null, key: string | null): number => {
    if (uri) {
      const byUri = req.queueUris.indexOf(uri);
      if (byUri >= 0) return byUri;
    }
    if (key) {
      const byKey = keys.indexOf(key);
      if (byKey >= 0) return byKey;
    }
    return -1;
  };

  const reportedIndex = req.nowPlayingIndex;
  const nowIndex =
    typeof reportedIndex === 'number' && reportedIndex >= 0 && reportedIndex < req.queueUris.length
      ? reportedIndex
      : locate(req.nowPlayingUri ?? null, req.nowPlayingKey ?? null);
  const fillerIndex = locate(next.enqueuedUri, next.enqueuedKey);

  // Confirm the filler landed. Once any client has seen it, we can trust its
  // later absence to mean it was removed rather than not yet written.
  if (fillerIndex >= 0) next.enqueuedSeen = true;

  if (next.enqueuedUri) {
    // The playhead has reached or gone past it, so it's had its turn.
    const played = fillerIndex >= 0 && nowIndex >= fillerIndex;
    const removed = fillerIndex === -1 && next.enqueuedSeen;
    const neverLanded =
      fillerIndex === -1 && !next.enqueuedSeen && now - next.enqueuedAt > ENQUEUE_TIMEOUT_MS;

    if (played || removed) {
      // It belongs to the normal queue now, not the preview. Remember it so it
      // isn't offered straight back.
      next.upcoming = next.upcoming.filter((t) => t.uri !== next.enqueuedUri);
      next.recentlyPlayed.push(next.enqueuedUri);
      if (next.recentlyPlayed.length > RECENT_MEMORY) {
        next.recentlyPlayed = next.recentlyPlayed.slice(-RECENT_MEMORY);
      }
      next.enqueuedUri = null;
      next.enqueuedKey = null;
      next.enqueuedSeen = false;
    } else if (neverLanded) {
      // Never appeared in any snapshot — the client's add failed. Release it so
      // someone can retry, keeping it at the head of the preview.
      next.enqueuedUri = null;
      next.enqueuedKey = null;
      next.enqueuedSeen = false;
    }
    // Otherwise it's parked and still waiting its turn. Leave it be.
  }

  // Anything a user has queued in the meantime shouldn't also be suggested.
  next.upcoming = next.upcoming.filter(
    (t) => t.uri === next.enqueuedUri || (!inQueue.has(t.uri) && t.uri !== req.nowPlayingUri),
  );

  // Top up, skipping anything already queued, previewed, or playing right now —
  // re-suggesting the track currently coming out of the speaker looks broken.
  const seen = new Set([
    ...next.upcoming.map((t) => t.uri),
    ...req.queueUris,
    ...next.recentlyPlayed,
  ]);
  if (req.nowPlayingUri) seen.add(req.nowPlayingUri);

  // Same guard by name, so a re-keyed queue entry isn't offered as if it were
  // a track the office hasn't just heard.
  const seenKeys = new Set([...keys, ...(req.nowPlayingKey ? [req.nowPlayingKey] : [])]);
  for (const candidate of req.candidates) {
    if (next.upcoming.length >= UPCOMING_SIZE) break;
    if (!candidate.uri || seen.has(candidate.uri)) continue;
    if (seenKeys.has(trackKey(candidate.trackName, candidate.artist))) continue;
    next.upcoming.push(candidate);
    seen.add(candidate.uri);
  }

  let enqueue: DjTrack | null = null;
  if (next.enabled && leaseHeld && !next.enqueuedUri) {
    const head = next.upcoming[0];
    // "Dry" means nothing waits AFTER the playhead. Counting queue length would
    // be wrong — every track played today is still sitting in the queue behind
    // the pointer, so the queue is never empty once music has been on.
    const waitingAfterPlayhead =
      nowIndex >= 0 ? req.queueUris.length - 1 - nowIndex : req.queueUris.length;
    if (head && waitingAfterPlayhead === 0) {
      enqueue = head;
      next.enqueuedUri = head.uri;
      next.enqueuedKey = trackKey(head.trackName, head.artist);
      next.enqueuedAt = now;
      next.enqueuedSeen = false;
    }
  }

  next.updatedAt = now;

  return {
    session: next,
    enqueue,
    leaseHeld,
    upcoming: next.upcoming,
    fillerUri: next.enqueuedUri,
  };
}
