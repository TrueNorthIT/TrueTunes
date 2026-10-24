import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import styles from '../styles/Splash.module.css';

interface Props {
  ready: boolean;
}

const MIN_MS = 900;

/** Covers the window while sign-in, the speaker groups and Home load, so the shell never flashes empty. */
export function Splash({ ready }: Props) {
  const [fading, setFading] = useState(false);
  const [gone, setGone] = useState(false);
  const mountRef = useRef(0);
  useLayoutEffect(() => {
    mountRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (!ready) return;
    const elapsed = Date.now() - mountRef.current;
    const remaining = Math.max(0, MIN_MS - elapsed);
    const t1 = setTimeout(() => setFading(true), remaining);
    const t2 = setTimeout(() => setGone(true), remaining + 450);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [ready]);

  if (gone) return null;

  return (
    <div
      className={`page-scale ${styles.splash}${fading ? ' ' + styles.fading : ''}`}
      role="status"
      aria-label="Loading True Tunes"
    >
      <div className={styles.inner}>
        <div className={styles.name}>True Tunes</div>
        <div className={styles.bar} aria-hidden="true" />
      </div>
    </div>
  );
}
