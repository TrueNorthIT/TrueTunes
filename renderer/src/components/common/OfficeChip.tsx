import styles from './OfficeChip.module.css';

/** "Queued here 27 times": how often the office has queued this, from the queue stats. Nothing below 1. */
export function OfficeChip({ count, className }: { count: number | undefined; className?: string }) {
  if (!count || count < 1) return null;
  return (
    <div className={[styles.chip, className].filter(Boolean).join(' ')}>
      {count === 1 ? 'Queued here once' : `Queued here ${count} times`}
    </div>
  );
}
