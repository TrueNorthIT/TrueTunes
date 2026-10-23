import type { CSSProperties, ReactNode } from 'react';
import styles from './BarList.module.css';

export interface BarListRow {
  key: string;
  name: string;
  value: number;
  /** The figure printed at the end of the bar. */
  label: ReactNode;
  /** A quieter figure after it. */
  sub?: ReactNode;
  title?: string;
  /** Series colour for a highlighted row (you, or someone picked); the name turns bold. Others are muted. */
  colour?: string | null;
}

/** Horizontal bars: name, bar, value, sub-value. `ranked` adds a place number; `max` fixes the full-width value. */
export function BarList({ rows, max, ranked }: { rows: BarListRow[]; max?: number; ranked?: boolean }) {
  const top = max ?? Math.max(1e-9, ...rows.map((r) => r.value));
  return (
    <div className={styles.bars} style={{ '--rank-col': ranked ? '1.6em' : '0px' } as CSSProperties}>
      {rows.map((r, i) => (
        <div key={r.key} className={styles.row} title={r.title}>
          <span className={styles.rank}>{ranked ? i + 1 : ''}</span>
          <span className={`${styles.name}${r.colour ? ' ' + styles.strong : ''}`}>{r.name}</span>
          <span className={styles.track}>
            <span
              className={styles.bar}
              style={{ width: `${Math.min(100, (r.value / top) * 100)}%`, background: r.colour ?? 'var(--glass)' }}
            />
          </span>
          <span className={styles.value}>{r.label}</span>
          {r.sub !== undefined && <span className={styles.sub}>{r.sub}</span>}
        </div>
      ))}
    </div>
  );
}
