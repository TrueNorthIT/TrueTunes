import { useCallback, useEffect, useRef, useState } from "react";
import { getActiveProvider } from "../providers";
import type { NormalizedPlaybackState } from "../types/provider";
import { fmtTime } from "../lib/itemHelpers";

export interface PlaybackState {
  isVisible: boolean;
  trackName: string;
  artistName: string;
  artUrl: string | null;
  stateIcon: string;
  timeLabel: string;
  progressPct: number;
  durationMs: number;
  isPlaying: boolean;
  shuffle: boolean;
  repeat: "none" | "one" | "all";
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
  trackName: "",
  artistName: "",
  artUrl: null,
  stateIcon: "–",
  timeLabel: "",
  progressPct: 0,
  durationMs: 0,
  isPlaying: false,
  shuffle: false,
  repeat: "none",
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

export function usePlayback(activeGroupId: string | null) {
  const [state, setState] = useState<PlaybackState>(IDLE_STATE);

  // Internal progress tracking — these don't need to trigger re-renders on every tick
  const positionMsRef = useRef(0);
  const durationMsRef = useRef(0);
  const lastUpdateAtRef = useRef(0);
  const isPlayingRef = useRef(false);

  // Always-current queue cursors — updated immediately on every provider push,
  // before the !name guard and outside React batching, so callers never
  // read a version that's one message behind.
  const queueIdRef      = useRef<string | null>(null);
  const queueVersionRef = useRef<string | null>(null);

  // Cache normalized state per groupId so we can restore on group switch
  const groupCache = useRef<Map<string, NormalizedPlaybackState>>(new Map());

  // Track activeGroupId in a ref so the subscription handler (registered once) always sees the current value
  const activeGroupIdRef = useRef(activeGroupId);
  useEffect(() => {
    activeGroupIdRef.current = activeGroupId;
  }, [activeGroupId]);

  const applyState = useCallback((normalized: NormalizedPlaybackState) => {
    const { status, isPlaying, positionMs, durationMs, currentTrack,
            shuffle, repeatMode, queueId, queueVersion, queueItemId } = normalized;

    const pct = durationMs > 0 ? Math.min((positionMs / durationMs) * 100, 100) : 0;

    positionMsRef.current = positionMs;
    durationMsRef.current = durationMs;
    lastUpdateAtRef.current = Date.now();
    isPlayingRef.current = isPlaying;

    if (queueId) {
      queueIdRef.current = queueId;
      window.sonos.setQueueId(queueId);
    }
    if (queueVersion) queueVersionRef.current = queueVersion;

    if (!currentTrack?.title) {
      // Still surface queue cursors into React state so useQueue can react to them
      // even when nothing is playing (no track name).
      if (queueId || queueVersion || queueItemId) {
        setState(prev => ({
          ...prev,
          ...(queueId      ? { queueId }      : {}),
          ...(queueVersion ? { queueVersion } : {}),
          ...(queueItemId  ? { queueItemId }  : {}),
        }));
      }
      return;
    }

    setState((prev) => ({
      isVisible: true,
      trackName: currentTrack.title,
      artistName: currentTrack.artist,
      artUrl: currentTrack.imageUrl,
      stateIcon: status === 'playing' ? "▶" : status === 'paused' ? "⏸" : "–",
      timeLabel: durationMs > 0 ? `${fmtTime(positionMs)} / ${fmtTime(durationMs)}` : "",
      progressPct: pct,
      durationMs,
      isPlaying,
      shuffle,
      // Playback state doesn't carry volume — keep whatever the provider last delivered.
      volume: prev.volume,
      repeat: repeatMode,
      currentObjectId:
        currentTrack.id !== prev.currentObjectId ? currentTrack.id : prev.currentObjectId,
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
      const pos = Math.min(
        positionMsRef.current + elapsed,
        durationMsRef.current || 1,
      );
      const dur = durationMsRef.current;
      const pct = dur > 0 ? (pos / dur) * 100 : 0;
      setState((prev) => ({
        ...prev,
        timeLabel: dur > 0 ? `${fmtTime(pos)} / ${fmtTime(dur)}` : "",
        progressPct: pct,
      }));
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
        // Cache for every group
        if (msgGroupId) groupCache.current.set(msgGroupId, normalized);

        // Only apply to UI if it's for the active group (or group isn't known yet)
        if (
          msgGroupId &&
          activeGroupIdRef.current &&
          msgGroupId !== activeGroupIdRef.current
        ) return;

        applyState(normalized);
      },
      (vol) => setState((prev) => ({ ...prev, volume: vol })),
    );

    return () => { unsubReady(); unsubPlayback(); };
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
      const cached = groupCache.current.get(groupId);
      if (cached) {
        // Reset currentObjectId to force downstream reload
        setState((prev) => ({ ...prev, currentObjectId: null }));
        applyState(cached);
        // Re-null after applyState in case it repopulated from stale cache
        queueVersionRef.current = null;
      } else {
        setState({
          ...IDLE_STATE,
          isVisible: true,
          trackName: "Nothing playing",
        });
      }
    },
    [applyState],
  );

  return { playback: state, applyGroupCache, queueIdRef, queueVersionRef };
}
