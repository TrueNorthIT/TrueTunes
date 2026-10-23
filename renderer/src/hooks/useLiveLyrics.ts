import { useEffect, useRef } from 'react';
import { activeLyricIndex, lyricElapsedMs, useLyrics } from './useLyrics';

/** Unsynced lyrics as display lines: trimmed, blank lines dropped. */
export function plainLyricLines(plain: string | null | undefined): string[] {
  return (plain ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
}

/** scrollTop that puts the line's centre `at` (0 to 1) of the way down a box `boxHeight` tall. */
export function followScrollTop(lineTop: number, lineHeight: number, boxHeight: number, at: number): number {
  return Math.max(0, lineTop + lineHeight / 2 - boxHeight * at);
}

/**
 * The playing track's lyrics as the Home lyrics box and the lyrics page show them: synced lines with the
 * active one, or the plain lyrics when there are no synced ones. `pending` only while nothing is known yet.
 */
export function useLiveLyrics(np: {
  displayTrack: string | null | undefined;
  displayArtist: string | null | undefined;
  albumName: string | null | undefined;
  durationMs: number;
  progressPct: number;
}) {
  const lyr = useLyrics(np.displayTrack, np.displayArtist, np.albumName, np.durationMs);
  const activeLine = activeLyricIndex(lyr.lines, lyricElapsedMs(np.progressPct, np.durationMs));
  const plain = lyr.lines.length ? [] : plainLyricLines(lyr.plainLyrics);
  const hasLyrics = lyr.lines.length > 0 || plain.length > 0;
  return { ...lyr, activeLine, plain, hasLyrics, pending: lyr.isLoading && !hasLyrics };
}

/**
 * Keeps the active line `at` (0 to 1) of the way down the scroll box: a jump the first time, smooth after,
 * and never smooth under reduced motion. The box must be the lines' offset parent (positioned).
 */
export function useFollowActiveLine(activeLine: number, at: number) {
  const boxRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrolledRef = useRef(false);
  useEffect(() => {
    const follow = (smooth: boolean) => {
      const box = boxRef.current;
      const line = lineRefs.current[activeLine];
      if (!box || !line || activeLine < 0 || typeof box.scrollTo !== 'function') return;
      const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      box.scrollTo({
        top: followScrollTop(line.offsetTop, line.offsetHeight, box.clientHeight, at),
        behavior: smooth && !calm ? 'smooth' : 'auto',
      });
      scrolledRef.current = true;
    };
    follow(scrolledRef.current);
    // A resize rewraps the lines, so put the active one back in place straight away.
    const onResize = () => follow(false);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [activeLine, at]);
  return { boxRef, lineRefs };
}
