import { useCallback, useEffect, useRef, useState } from 'react';
import { getActiveProvider } from '../providers';
import type { NormalizedPlaybackState } from '../types/provider';
import { fmtTime } from '../lib/itemHelpers';
import { setPlaybackPosition, ZERO_POSITION, type PlaybackPosition } from './playbackPosition';

export interface PlaybackState {
  isVisible: boolean;
  trackName: string;
  artistName: string;
  artUrl: string | null;
  stateIcon: string;
  /** Track length. The moving position lives in playbackPosition.ts so a tick doesn't re-render the app. */
  durationMs: number;
  isPlaying: boolean;
  shuffle: boolean;
  repeat: 'none' | 'one' | 'all';
  volume: number;
  currentObjectId: string | null;
  currentServiceId: string | null;
  currentAccountId: string | null;
  currentAlbumId: string | null;
  currentAlbumName: string | null;
  isExplicit: boolean;
  queueId: string | null;
  queueVersion: string | null;
  queueItemId: string | null;
}

const IDLE_STATE: PlaybackState = {
  isVisible: false,
  trackName: '',
  artistName: '',
  artUrl: null,
  stateIcon: '–',
  durationMs: 0,
  isPlaying: false,
  shuffle: false,
  repeat: 'none',
  volume: 50,
  currentObjectId: null,
  currentServiceId: null,
  currentAccountId: null,
  currentAlbumId: null,
  currentAlbumName: null,
  isExplicit: false,
  queueId: null,
  queueVersion: null,
  queueItemId: null,
};

const positionOf = (positionMs: number, durationMs: number): PlaybackPosition => ({
  positionMs,
  durationMs,
  progressPct: durationMs > 0 ? Math.min((positionMs / durationMs) * 100, 100) : 0,
  timeLabel: durationMs > 0 ? `${fmtTime(positionMs)} / ${fmtTime(durationMs)}` : '',
  trackEndsAtMs: Date.now() + durationMs - positionMs,
});

/** A normalised payload with every field settled: what the hook and the per-group cache hold. */
export type MergedPlayback = NormalizedPlaybackState & { positionMs: number; durationMs: number };
interface Known {
  state: MergedPlayback;
  /** When `state.positionMs` was true. */
  at: number;
}

/**
 * Sonos sends partial messages too (playback only, metadata only, empty command responses). A field a message does
 * not carry is unknown, not zero: it keeps what we knew for the same track. A different track starts from scratch.
 */
export function mergePlayback(prev: Known | undefined, n: NormalizedPlaybackState, now: number): Known {
  const base = prev?.state;
  const hasTrack = !!n.currentTrack?.title;
  const track = hasTrack ? n.currentTrack : (base?.currentTrack ?? null);
  if (!prev || !base || !track) {
    return { state: { ...n, positionMs: n.positionMs ?? 0, durationMs: n.durationMs ?? 0 }, at: now };
  }
  const carriesCursor = !!(n.queueId || n.queueVersion || n.queueItemId);
  if (!hasTrack && !n.playbackKnown && !carriesCursor) return prev; // an empty message: nothing changes

  const same = base.currentTrack?.id === track.id && base.currentTrack?.title === track.title;
  const durationMs = n.durationMs ?? (same ? base.durationMs : 0);
  // Carry the position on by the time that has passed, but only while that is still inside the track: after a long
  // gap (a group switched back to, a phone woken) it is unknown, not the end of the track.
  const estimate = base.positionMs + (base.isPlaying ? now - prev.at : 0);
  const positionMs = n.positionMs ?? (same && (!base.durationMs || estimate < base.durationMs) ? estimate : 0);
  const from = n.playbackKnown ? n : base; // status and play modes come together in the playback block
  return {
    state: {
      ...n,
      currentTrack: track,
      positionMs,
      durationMs,
      status: from.status,
      isPlaying: from.isPlaying,
      shuffle: from.shuffle,
      repeatMode: from.repeatMode,
      // each cursor from the message that carries it
      queueId: n.queueId ?? base.queueId,
      queueVersion: n.queueVersion ?? base.queueVersion,
      queueItemId: n.queueItemId ?? base.queueItemId,
    },
    at: now,
  };
}

export function usePlayback(activeGroupId: string | null) {
  const [state, setState] = useState<PlaybackState>(IDLE_STATE);
  useEffect(() => {
    setPlaybackPosition(ZERO_POSITION);
  }, []);

  // Internal progress tracking — these don't need to trigger re-renders on every tick
  const positionMsRef = useRef(0);
  const durationMsRef = useRef(0);
  const lastUpdateAtRef = useRef(0);
  const isPlayingRef = useRef(false);

  // Always-current queue cursors — updated immediately on every provider push,
  // before the !name guard and outside React batching, so callers never
  // read a version that's one message behind.
  const queueIdRef = useRef<string | null>(null);
  const queueVersionRef = useRef<string | null>(null);

  // Cache normalized state per groupId so we can restore on group switch
  const groupCache = useRef<Map<string, Known>>(new Map());

  // Track activeGroupId in a ref so the subscription handler (registered once) always sees the current value
  const activeGroupIdRef = useRef(activeGroupId);
  useEffect(() => {
    activeGroupIdRef.current = activeGroupId;
  }, [activeGroupId]);

  const applyState = useCallback((normalized: MergedPlayback) => {
    const {
      status,
      isPlaying,
      positionMs,
      durationMs,
      currentTrack,
      shuffle,
      repeatMode,
      queueId,
      queueVersion,
      queueItemId,
    } = normalized;

    positionMsRef.current = positionMs;
    durationMsRef.current = durationMs;
    lastUpdateAtRef.current = Date.now();
    isPlayingRef.current = isPlaying;

    if (queueId && queueId !== queueIdRef.current) {
      queueIdRef.current = queueId;
      void window.sonos.setQueueId(queueId);
    }
    if (queueVersion) queueVersionRef.current = queueVersion;

    if (!currentTrack?.title) {
      // Still surface queue cursors into React state so useQueue can react to them
      // even when nothing is playing (no track name).
      if (queueId || queueVersion || queueItemId) {
        setState((prev) => ({
          ...prev,
          ...(queueId ? { queueId } : {}),
          ...(queueVersion ? { queueVersion } : {}),
          ...(queueItemId ? { queueItemId } : {}),
        }));
      }
      return;
    }

    setPlaybackPosition(positionOf(positionMs, durationMs));
    setState((prev) => ({
      isVisible: true,
      trackName: currentTrack.title,
      artistName: currentTrack.artist,
      artUrl: currentTrack.imageUrl,
      stateIcon: status === 'playing' ? '▶' : status === 'paused' ? '⏸' : '–',
      durationMs,
      isPlaying,
      shuffle,
      // Playback state doesn't carry volume — keep whatever the provider last delivered.
      volume: prev.volume,
      repeat: repeatMode,
      currentObjectId: currentTrack.id !== prev.currentObjectId ? currentTrack.id : prev.currentObjectId,
      currentServiceId: currentTrack.serviceId,
      currentAccountId: currentTrack.accountId,
      currentAlbumId: currentTrack.albumId,
      currentAlbumName: currentTrack.albumName,
      isExplicit: currentTrack.isExplicit,
      queueId,
      queueVersion,
      queueItemId,
    }));
  }, []);

  // Progress tick — runs every second while playing
  useEffect(() => {
    if (!state.isPlaying) return;
    const timer = setInterval(() => {
      const elapsed = Date.now() - lastUpdateAtRef.current;
      const pos = Math.min(positionMsRef.current + elapsed, durationMsRef.current || 1);
      setPlaybackPosition(positionOf(pos, durationMsRef.current));
    }, 1000);
    return () => clearInterval(timer);
  }, [state.isPlaying]);

  // Provider subscription
  useEffect(() => {
    const unsubReady = window.sonos.onWsReady(() => {
      setState((prev) => ({ ...prev, isVisible: true }));
    });

    const provider = getActiveProvider();
    const unsubPlayback = provider.subscribePlayback(
      (msgGroupId, normalized) => {
        // Cache for every group, merged with what that group last said
        // (a message with no group id belongs to the active group, as the check below treats it)
        const key = msgGroupId ?? activeGroupIdRef.current ?? '';
        const prev = groupCache.current.get(key);
        const known = mergePlayback(prev, normalized, Date.now());
        if (known === prev) return; // an empty message: nothing changed, so the clock and state are left alone
        groupCache.current.set(key, known);

        // Only apply to UI if it's for the active group (or group isn't known yet)
        if (msgGroupId && activeGroupIdRef.current && msgGroupId !== activeGroupIdRef.current) return;

        applyState(known.state);
      },
      (vol) => setState((prev) => ({ ...prev, volume: vol }))
    );

    return () => {
      unsubReady();
      unsubPlayback();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply cached state when active group changes
  const applyGroupCache = useCallback(
    (groupId: string) => {
      // Update the group ref immediately — don't wait for the useEffect.
      // Without this, provider messages for the old group can still arrive and
      // overwrite queueVersionRef with the old etag before the effect runs.
      activeGroupIdRef.current = groupId;
      // Clear queue cursors. queueVersionRef must NOT be restored from
      // cache — the cached version can be stale if the queue changed since
      // the last push.  It will be refreshed by the next live message
      // or by the API response etag on the first add.
      queueIdRef.current = null;
      queueVersionRef.current = null;
      const cached = groupCache.current.get(groupId)?.state;
      if (cached) {
        // Reset currentObjectId to force downstream reload
        setState((prev) => ({ ...prev, currentObjectId: null }));
        applyState(cached);
        // Re-null after applyState in case it repopulated from stale cache
        queueVersionRef.current = null;
      } else {
        setPlaybackPosition(ZERO_POSITION);
        setState({
          ...IDLE_STATE,
          isVisible: true,
          trackName: 'Nothing playing',
        });
      }
    },
    [applyState]
  );

  return { playback: state, applyGroupCache, queueIdRef, queueVersionRef };
}
