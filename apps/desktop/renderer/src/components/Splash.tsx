import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import styles from '../styles/Splash.module.css';

interface Props {
  ready: boolean;
}

const MIN_MS = 900;

export function Splash({ ready }: Props) {
  const [fading,  setFading]  = useState(false);
  const [gone,    setGone]    = useState(false);
  const mountRef = useRef(0);
  useLayoutEffect(() => { mountRef.current = Date.now(); }, []);

  useEffect(() => {
    if (!ready) return;
    const elapsed   = Date.now() - mountRef.current;
    const remaining = Math.max(0, MIN_MS - elapsed);
    const t1 = setTimeout(() => setFading(true),  remaining);
    const t2 = setTimeout(() => setGone(true),    remaining + 450);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [ready]);

  if (gone) return null;

  return (
    <div className={`${styles.splash}${fading ? ' ' + styles.fading : ''}`}>
      <div className={styles.inner}>
        <div className={styles.icon}>♫</div>
        <div className={styles.name}>True Tunes</div>
        <div className={styles.dots}>
          <span /><span /><span />
        </div>
      </div>
    </div>
  );
}
