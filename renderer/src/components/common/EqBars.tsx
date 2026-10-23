import styles from './EqBars.module.css';

/** Three animated bars: "this is playing". Static under reduced motion. Decorative; pair with a text state. */
export function EqBars({ className }: { className?: string }) {
  return (
    <span className={[styles.eq, className].filter(Boolean).join(' ')} aria-hidden="true">
      <span /><span /><span />
    </span>
  );
}
