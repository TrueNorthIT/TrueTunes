import styles from './EqBars.module.css';

/**
 * Three animated bars: "this is the current track". Still when `paused` (audio isn't actually playing)
 * and under reduced motion. Decorative; pair with a text state.
 */
export function EqBars({ className, paused = false }: { className?: string; paused?: boolean }) {
  return (
    <span className={[styles.eq, paused ? styles.still : '', className].filter(Boolean).join(' ')} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}
