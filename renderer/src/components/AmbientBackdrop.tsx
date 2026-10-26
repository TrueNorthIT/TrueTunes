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

  // A new source fades the current layers out and adds one on top, adjusted during render rather than in an effect.
  const [prevSrc, setPrevSrc] = useState<string | null>(null);
  if (src !== prevSrc) {
    setPrevSrc(src);
    if (!(src && layers.some((l) => !l.out && l.src === src))) {
      const faded = layers.map((l) => ({ ...l, out: true }));
      // ids only need to be unique among the layers on screen; the newest is always last
      const id = (layers[layers.length - 1]?.id ?? 0) + 1;
      setLayers(src ? [...faded, { id, src, out: false, settled: false }] : faded);
    }
  }

  useEffect(() => {
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
