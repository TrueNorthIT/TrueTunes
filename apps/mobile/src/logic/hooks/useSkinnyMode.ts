import { useRef } from 'react';
import { useWindowDimensions } from 'react-native';

// Width below which the full layout no longer fits and the app collapses
// to the skinny side-panel layout (queue + condensed transport only).
export const FULL_MIN = 864 + 280; // 1144

// Hysteresis: once skinny, don't pop back to full until comfortably past the
// threshold, so resizing right at the boundary doesn't flicker between layouts.
export const EXIT_BUFFER = 40;

/** Pure threshold logic with hysteresis. */
export function computeSkinny(width: number, prevSkinny: boolean): boolean {
  return prevSkinny ? width <= FULL_MIN + EXIT_BUFFER : width < FULL_MIN;
}

/** Returns true when the window is narrow enough to use the skinny side-panel layout. */
export function useSkinnyMode(): boolean {
  const { width } = useWindowDimensions();
  const prev = useRef<boolean | null>(null);
  const skinny = computeSkinny(width, prev.current ?? width < FULL_MIN);
  prev.current = skinny;
  return skinny;
}
