import { useSyncExternalStore } from 'react';

/** The part of playback that changes every second. Kept out of React state so a tick re-renders only its readers. */
export interface PlaybackPosition {
  positionMs: number;
  durationMs: number;
  progressPct: number;
  /** "1:35 / 3:00", or '' when the duration is unknown. */
  timeLabel: string;
  /** Wall-clock time the track ends. Constant while it plays; moves only on a seek, pause or resync. */
  trackEndsAtMs: number;
}

export const ZERO_POSITION: PlaybackPosition = {
  positionMs: 0,
  durationMs: 0,
  progressPct: 0,
  timeLabel: '',
  trackEndsAtMs: 0,
};

// One per window, like the playback it mirrors.
let snapshot = ZERO_POSITION;
const listeners = new Set<() => void>();

export const getPlaybackPosition = () => snapshot;

export function setPlaybackPosition(next: PlaybackPosition) {
  snapshot = next;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

/** Re-renders only when `select`'s result changes (compared with Object.is), so pick primitives. */
export function usePlaybackPosition<T = PlaybackPosition>(
  select: (p: PlaybackPosition) => T = (p) => p as unknown as T
): T {
  return useSyncExternalStore(subscribe, () => select(snapshot));
}

// scripts/perf-trace.mjs replays the tick through this when nothing is playing. Dev server only.
if (import.meta.env.DEV) {
  (window as unknown as { __playbackPosition: unknown }).__playbackPosition = {
    get: getPlaybackPosition,
    set: setPlaybackPosition,
  };
}
