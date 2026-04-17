import { useCallback, useEffect, useRef, useState } from "react";
import type { PlaybackPayload } from "../types/sonos";
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
}

const IDLE_STATE: PlaybackState = {
  isVisible: false,
  trackName: "",
  artistName: "",
  artUrl: null,
  stateIcon: "\u2013",
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
};

export function usePlayback(activeGroupId: string | null) {
  const [state, setState] = useState<PlaybackState>(IDLE_STATE);

  // Internal progress tracking — these don't need to trigger re-renders on every tick
  const positionMsRef = useRef(0);
  const durationMsRef = useRef(0);
  const lastUpdateAtRef = useRef(0);
  const isPlayingRef = useRef(false);

  // Always-current queue cursors — updated immediately on every WS push,
  // before the !name guard and outside React batching, so callers never
  // read a version that's one message behind.
  const queueIdRef      = useRef<string | null>(null);
  const queueVersionRef = useRef<string | null>(null);

  // Cache last WS payload per groupId so we can restore on group switch
  const groupCache = useRef<Map<string, PlaybackPayload>>(new Map());

  // Track activeGroupId in a ref so the WS handler (registered once) always sees the current value
  const activeGroupIdRef = useRef(activeGroupId);
  useEffect(() => {
    activeGroupIdRef.current = activeGroupId;
  }, [activeGroupId]);


  const applyPayload = useCallback((payload: PlaybackPayload) => {
    const stateVal = payload?.playback?.playbackState ?? "";
    const isPlaying = stateVal.includes("PLAYING");
    const isPaused = stateVal.includes("PAUSED");

    const track = payload?.metadata?.currentItem?.track;
    const name = track?.name ?? track?.title ?? "";
    const rawArtist = track?.artist;
    const artist = rawArtist
      ? typeof rawArtist === "object"
        ? (rawArtist.name ?? "")
        : String(rawArtist)
      : "";

    const posMs = payload?.playback?.positionMillis ?? 0;
    const durMs = track?.durationMillis ?? 0;
    const pct = durMs > 0 ? Math.min((posMs / durMs) * 100, 100) : 0;
    const volume =
      payload?.playback?.playbackState === "NO_GROUPS" ? 0 : state.volume;
    const shuffle = payload?.playback?.playModes?.shuffle ?? false;
    const repeat: PlaybackState["repeat"] = payload?.playback?.playModes?.repeatOne
      ? "one"
      : payload?.playback?.playModes?.repeat
        ? "all"
        : "none";
    const queueId = payload?.playback?.queueId ?? null;
    const queueVersion = payload?.playback?.queueVersion ?? null;
    const oid = track?.id?.objectId ?? null;
    const serviceId = track?.id?.serviceId ?? null;
    const accountId = track?.id?.accountId ?? null;
    const albumObj = track?.album as
      | { name?: string; id?: { objectId?: string } }
      | undefined;
    const albumId = albumObj?.id?.objectId ?? null;
    const albumName = albumObj?.name ?? null;
    const isExplicit = !!(
      track?.explicit ??
      (track as Record<string, unknown> | undefined)?.["isExplicit"]
    );
    const artUrls = [
      ...(track?.images?.map((i) => i.url) ?? []),
      track?.imageUrl,
    ].filter((u): u is string => !!u);
    const artUrl = artUrls.find((u) => u.startsWith("https://")) ?? null;

    positionMsRef.current = posMs;
    durationMsRef.current = durMs;
    lastUpdateAtRef.current = Date.now();
    isPlayingRef.current = isPlaying;
    if (queueId) {
      queueIdRef.current = queueId;
      window.sonos.setQueueId(queueId);
    }
    if (queueVersion) queueVersionRef.current = queueVersion;

    if (!name) {
      // Still surface queue cursors into React state so useQueue can react to them
      // even when nothing is playing (no track name).
      if (queueId || queueVersion) {
        setState(prev => ({
          ...prev,
          ...(queueId    ? { queueId }    : {}),
          ...(queueVersion ? { queueVersion } : {}),
        }));
      }
      return;
    }

    setState((prev) => ({
      isVisible: true,
      trackName: name,
      artistName: artist,
      artUrl,
      stateIcon: isPlaying ? "\u25b6" : isPaused ? "\u23f8" : "\u2013",
      timeLabel: durMs > 0 ? `${fmtTime(posMs)} / ${fmtTime(durMs)}` : "",
      progressPct: pct,
      durationMs: durMs,
      isPlaying,
      shuffle,
      volume,
      repeat,
      currentObjectId:
        oid !== prev.currentObjectId ? oid : prev.currentObjectId,
      currentServiceId: serviceId,
      currentAccountId: accountId,
      currentAlbumId: albumId,
      currentAlbumName: albumName,
      isExplicit,
      queueId,
      queueVersion,
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

  // WS subscriptions
  useEffect(() => {
    const unsubReady = window.sonos.onWsReady(() => {
      setState((prev) => ({ ...prev, isVisible: true }));
    });

    const unsubMsg = window.sonos.onWsMessage((header, payload) => {
      const h = header as Record<string, unknown>;

      if (h?.["namespace"] === "groupVolume") {
        const vol = (payload as { volume?: number })?.volume;
        if (vol !== undefined) setState((prev) => ({ ...prev, volume: vol }));
        return;
      }

      if (h?.["namespace"] !== "playbackExtended") return;

      const msgGroupId = h?.["groupId"] as string | undefined;
      const p = payload as PlaybackPayload;

      // Cache for every group
      if (msgGroupId) groupCache.current.set(msgGroupId, p);

      // Only apply to UI if it's for the active group (or group isn't known yet)
      if (
        msgGroupId &&
        activeGroupIdRef.current &&
        msgGroupId !== activeGroupIdRef.current
      )
        return;

      applyPayload(p);
    });

    return () => { unsubReady(); unsubMsg(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply cached state when active group changes
  const applyGroupCache = useCallback(
    (groupId: string) => {
      // Update the group ref immediately — don't wait for the useEffect.
      // Without this, WS messages for the old group can still arrive and
      // overwrite queueVersionRef with the old etag before the effect runs.
      activeGroupIdRef.current = groupId;
      // Clear queue cursors. queueVersionRef must NOT be restored from
      // cache — the cached version can be stale if the queue changed since
      // the last WS push.  It will be refreshed by the next live WS message
      // or by the API response etag on the first add.
      queueIdRef.current = null;
      queueVersionRef.current = null;
      const cached = groupCache.current.get(groupId);
      if (cached) {
        // Reset currentObjectId to force downstream reload
        setState((prev) => ({ ...prev, currentObjectId: null }));
        applyPayload(cached);
        // Re-null after applyPayload in case it repopulated from stale cache
        queueVersionRef.current = null;
      } else {
        setState({
          ...IDLE_STATE,
          isVisible: true,
          trackName: "Nothing playing",
        });
      }
    },
    [applyPayload],
  );

  return { playback: state, applyGroupCache, queueIdRef, queueVersionRef };
}
