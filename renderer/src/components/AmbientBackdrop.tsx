import { useEffect, useState } from 'react';
import { useImage } from '../hooks/useImage';
import { usePageArtValue } from '../lib/pageArt';
import styles from '../styles/AmbientBackdrop.module.css';

interface Layer {
  id: number;
  src: string;
  out: boolean;
  settled: boolean;
}

let seq = 0;

/**
 * One fixed, heavily blurred copy of the current artwork behind everything.
 * Source: the page's artwork when it registers one (usePageArt, already cached), else the now-playing
 * art via the useImage cache. Hidden under prefers-reduced-transparency.
 */
export function AmbientBackdrop({ nowPlayingArt }: { nowPlayingArt: string | null }) {
  // pages register an already-cached (blob:) URL, so it is used as-is; only the now-playing art needs the cache
  const pageArt = usePageArtValue();
  const now = useImage(nowPlayingArt);
  const src = pageArt ?? now;
  const [layers, setLayers] = useState<Layer[]>([]);

  useEffect(() => {
    setLayers((prev) => {
      if (src && prev.some((l) => !l.out && l.src === src)) return prev;
      const faded = prev.map((l) => ({ ...l, out: true }));
      return src ? [...faded, { id: ++seq, src, out: false, settled: false }] : faded;
    });
    // drop the faded-out layers once the 1s crossfade is over
    const t = setTimeout(() => setLayers((p) => p.filter((l) => !l.out)), 1000);
    return () => clearTimeout(t);
  }, [src]);

  return (
    <div className={styles.ambient} aria-hidden="true">
      {layers.map((l) => (
        <div
          key={l.id}
          className={`${styles.layer}${l.out ? ' ' + styles.out : ''}${l.settled ? ' ' + styles.settled : ''}`}
          onAnimationEnd={() => setLayers((p) => p.map((x) => (x.id === l.id ? { ...x, settled: true } : x)))}
        >
          <img src={l.src} alt="" className={styles.img} />
        </div>
      ))}
    </div>
  );
}
