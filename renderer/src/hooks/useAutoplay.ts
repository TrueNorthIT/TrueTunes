import { useCallback, useEffect, useRef, useState } from 'react';
import type { NormalizedQueueItem } from '../types/provider';

/** How often each client checks in with the coordinator. */
const POLL_MS = 10_000;

/** Preview size — mirrors the coordinator's own UPCOMING_SIZE. */
const UPCOMING_SIZE = 3;

/**
 * Must match the server's `trackKey()` exactly.
 *
 * Sonos can hand a queued track back under a different objectId than the one we
 * added (issue #84), so the coordinator needs a name-based way to recognise its
 * own filler — otherwise it decides the add failed and queues the same pick
 * again and again.
 */
function trackKey(trackName?: string | null, artist?: string | null): string {
  return `${(trackName ?? '').trim().toLowerCase()}||${(artist ?? '').trim().toLowerCase()}`;
}

/**
 * Stable per-install id. The coordinator hands its enqueue lease to one client,
 * so the id has to survive reloads — a fresh id each mount would look like a new
 * client every time and let the lease bounce around.
 */
function clientId(): string {
  const KEY = 'truetunes.clientId';
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    // Private window or storage blocked — a per-session id still works, it just
    // won't be recognised as the same client after a reload.
    return crypto.randomUUID();
  }
}

export interface AutoplayState {
  enabled: boolean;
  upcoming: DjTrack[];
  /** Track parked at the tail; user picks are inserted in front of it. */
  fillerUri: string | null;
  setEnabled: (on: boolean) => void;
}

interface Options {
  groupId: string | null;
  items: NormalizedQueueItem[];
  nowPlayingUri: string | null;
  /**
   * Sonos' own 1-based queue position for the playing track. Far more reliable
   * than matching ids or names — the rest of the app already prefers it for the
   * same reason (see DraggableQueueRow).
   */
  nowPlayingQueueItemId?: string | null;
  /** Whoever is in the room, so picks suit the listeners rather than the office. */
  users?: string[];
  /** Appends the coordinator's pick. Must not attribute it to anyone. */
  onEnqueue: (track: DjTrack) => Promise<void> | void;
}

/**
 * Keeps this client in step with the autoplay coordinator.
 *
 * Every client polls and renders the same `upcoming`; only the one holding the
 * lease is ever told to enqueue, which is what stops four clients appending four
 * copies of the same filler.
 */
export function useAutoplay({
  groupId,
  items,
  nowPlayingUri,
  nowPlayingQueueItemId,
  users,
  onEnqueue,
}: Options): AutoplayState {
  const [state, setState] = useState<{ enabled: boolean; upcoming: DjTrack[]; fillerUri: string | null }>({
    enabled: false,
    upcoming: [],
    fillerUri: null,
  });

  // Read through refs inside the interval so changing queue contents don't
  // restart the timer — the poll always sees current values.
  const itemsRef = useRef(items);
  const nowPlayingRef = useRef(nowPlayingUri);
  const nowPlayingTitleRef = useRef<string | null>(null);
  const nowPlayingIndexRef = useRef<number | null>(null);
  const usersRef = useRef(users);
  const onEnqueueRef = useRef(onEnqueue);
  useEffect(() => {
    itemsRef.current = items;
    nowPlayingRef.current = nowPlayingUri;
    // Resolve the playing track's name identity from the queue, so the
    // coordinator can place the playhead even when the id has been re-keyed.
    const playing = items.find((i) => i.track.id === nowPlayingUri);
    nowPlayingTitleRef.current = playing
      ? trackKey(playing.track.title, playing.track.artist)
      : null;
    // Sonos reports a 1-based queue position; the coordinator works in indexes.
    const reported = Number(nowPlayingQueueItemId);
    nowPlayingIndexRef.current =
      nowPlayingQueueItemId && Number.isFinite(reported) ? reported - 1 : null;
    usersRef.current = users;
    onEnqueueRef.current = onEnqueue;
  });

  const pendingEnable = useRef<boolean | undefined>(undefined);
  /** Guards against a slow add overlapping the next poll and double-queueing. */
  const enqueuing = useRef(false);

  /**
   * Preview of last resort, straight from the DJ endpoint. Used when the
   * coordinator is unreachable or has nothing parked, so the section always
   * answers "what's next if nobody queues anything".
   */
  const fillPreviewDirectly = useCallback(async () => {
    const set = await window.sonos
      .fetchDjSet({
        limit: UPCOMING_SIZE,
        excludeUris: itemsRef.current.map((i) => i.track.id).filter(Boolean) as string[],
        ...(usersRef.current?.length ? { users: usersRef.current } : {}),
      })
      .catch(() => null);

    const tracks = set?.tracks ?? [];
    if (tracks.length === 0) return;
    // Never overwrite a coordinator-managed list — that one reflects what's
    // actually parked in the queue, this is only a stand-in.
    setState((prev) => (prev.upcoming.length > 0 ? prev : { ...prev, upcoming: tracks }));
  }, []);

  const poll = useCallback(async () => {
    // Coordination needs a group — the session is keyed by it — but the preview
    // doesn't. Returning early here left the section empty on every client that
    // hadn't picked a group yet, which is exactly when you most want to see what
    // the DJ would put on.
    if (!groupId) {
      await fillPreviewDirectly();
      return;
    }

    const setEnabled = pendingEnable.current;
    pendingEnable.current = undefined;

    const result = await window.sonos
      .djAutoplay({
        groupId,
        clientId: clientId(),
        // Index-aligned with queueKeys — the coordinator compares positions.
        queueUris: itemsRef.current.map((i) => i.track.id ?? ''),
        queueKeys: itemsRef.current.map((i) => trackKey(i.track.title, i.track.artist)),
        nowPlayingUri: nowPlayingRef.current,
        nowPlayingKey: nowPlayingTitleRef.current,
        nowPlayingIndex: nowPlayingIndexRef.current,
        ...(usersRef.current?.length ? { users: usersRef.current } : {}),
        ...(setEnabled !== undefined ? { setEnabled } : {}),
      })
      .catch(() => null);

    if (!result || result.error) {
      // Coordinator unreachable. Keep whatever we last showed, and if we've
      // never had picks, fall back to asking the DJ directly — the preview is
      // "what would play next", which doesn't depend on coordination.
      await fillPreviewDirectly();
      return;
    }

    const upcoming = result.upcoming ?? [];
    setState({
      enabled: !!result.enabled,
      upcoming,
      fillerUri: result.fillerUri ?? null,
    });

    // The coordinator answered but had nothing queued up — still show the room
    // what the DJ would pick, rather than an apologetic placeholder.
    if (upcoming.length === 0) await fillPreviewDirectly();

    if (result.leaseHeld && result.enqueue && !enqueuing.current) {
      enqueuing.current = true;
      try {
        await onEnqueueRef.current(result.enqueue);
      } finally {
        enqueuing.current = false;
      }
    }
  }, [groupId, fillPreviewDirectly]);

  // Switching group means a different queue with its own session. Clearing
  // first stops the previous room's picks — and worse, its fillerUri, which
  // decides where user tracks get inserted — leaking into the new one for the
  // second or two before the first poll lands.
  useEffect(() => {
    setState({ enabled: false, upcoming: [], fillerUri: null });
  }, [groupId]);

  useEffect(() => {
    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(timer);
  }, [poll]);

  const setEnabled = useCallback(
    (on: boolean) => {
      // Optimistic so the toggle feels immediate; the next poll confirms it.
      setState((s) => ({ ...s, enabled: on }));
      pendingEnable.current = on;
      void poll();
    },
    [poll],
  );

  return { ...state, setEnabled };
}
