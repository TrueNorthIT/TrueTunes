import { useEffect, useRef, useState } from 'react';
import { getActiveProvider } from '../providers';
import type { PlaybackState } from './usePlayback';

/**
 * The volume a player shows and sets: follows the group's volume unless the user is mid-drag, and sends a change
 * 150ms after the last one. Shared by the player bar's popover and the phone's Now playing slider.
 */
export function useVolumeControl(volume: number) {
  const [localVol, setLocalVol] = useState(volume);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preMuteRef = useRef<number>(volume > 0 ? volume : 50);

  // Sync incoming WS volume only when the user isn't actively dragging
  const dragging = useRef(false);
  useEffect(() => {
    if (!dragging.current) setLocalVol(volume);
  }, [volume]);

  const commitVolume = (val: number) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void getActiveProvider().setVolume(val);
      dragging.current = false;
    }, 150);
  };

  const setVolume = (val: number) => {
    setLocalVol(val);
    if (val > 0) preMuteRef.current = val;
    commitVolume(val);
  };

  const step = (delta: number) => {
    setLocalVol((prev) => {
      const next = Math.max(0, Math.min(100, prev + delta));
      if (next === prev) return prev;
      if (next > 0) preMuteRef.current = next;
      commitVolume(next);
      return next;
    });
  };

  const toggleMute = () => {
    if (localVol > 0) {
      preMuteRef.current = localVol;
      setLocalVol(0);
      commitVolume(0);
    } else {
      const restored = preMuteRef.current > 0 ? preMuteRef.current : 50;
      setLocalVol(restored);
      commitVolume(restored);
    }
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return {
    localVol,
    muted: localVol === 0,
    setVolume,
    step,
    toggleMute,
    /** Call when a drag starts, so a volume push from the room doesn't move the thumb under the finger. */
    startDrag: () => {
      dragging.current = true;
    },
  };
}

/** Shuffle and repeat toggles for the active group. `onShuffle` runs after a shuffle change (the queue reorders). */
export function usePlayModeToggles(playback: Pick<PlaybackState, 'shuffle' | 'repeat'>, onShuffle: () => void) {
  const { shuffle: rawShuffle, repeat: rawRepeat } = playback;
  const refresh = () => getActiveProvider().refreshPlayback();

  const toggleShuffle = () => getActiveProvider().setPlayModes({ shuffle: !rawShuffle }).then(refresh).then(onShuffle);

  const toggleRepeat = () => {
    const next = rawRepeat === 'none' ? 'all' : rawRepeat === 'all' ? 'one' : 'none';
    void getActiveProvider()
      .setPlayModes({ repeat: next as 'none' | 'one' | 'all' })
      .then(refresh);
  };

  return { toggleShuffle, toggleRepeat };
}
