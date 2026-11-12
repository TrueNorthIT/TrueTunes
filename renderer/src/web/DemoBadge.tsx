import styles from './DemoBadge.module.css';

/** Says, on every screen of /demo, that this is a pretend office: nothing here reaches the real speakers. */
export function DemoBadge() {
  return (
    <div className={styles.badge} role="note" title="A pretend office. Nothing here reaches the real speakers.">
      Demo
    </div>
  );
}
