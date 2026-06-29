import { useEffect, useState } from 'react';

// Width below which the full layout no longer fits and the renderer collapses
// to the skinny side-panel layout (queue + condensed transport only).
// Matches the player bar (800) + min queue (280) + padding that the full layout
// needs — kept in sync with src/main.ts's old minWidth.
export const FULL_MIN = 864 + 280; // 1144

// Hysteresis: once skinny, don't pop back to full until comfortably past the
// threshold, so dragging right at the boundary doesn't flicker between layouts.
const EXIT_BUFFER = 40;

/** Returns true when the window is narrow enough to use the skinny side-panel layout. */
export function useSkinnyMode(): boolean {
  const [skinny, setSkinny] = useState(() => window.innerWidth < FULL_MIN);

  useEffect(() => {
    function onResize() {
      const w = window.innerWidth;
      setSkinny((prev) => (prev ? w <= FULL_MIN + EXIT_BUFFER : w < FULL_MIN));
    }
    window.addEventListener('resize', onResize);
    onResize();
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return skinny;
}
