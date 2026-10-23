import type { ReactNode } from 'react';
import styles from './ChartTooltip.module.css';

export interface Tip {
  x: number;
  y: number;
  content: ReactNode;
}

/** Hover readout for a chart. Place it inside a `position: relative` frame; x and y are in that frame. */
export function ChartTooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div className={styles.tooltip} style={{ left: tip.x, top: tip.y }} role="tooltip">
      {tip.content}
    </div>
  );
}

export const TipTitle = ({ children }: { children: ReactNode }) => <div className={styles.title}>{children}</div>;

/** A name and a value; `swatch` is the series colour dot, when the row has one. */
export function TipRow({ name, value, swatch }: { name: ReactNode; value?: ReactNode; swatch?: ReactNode }) {
  return (
    <div className={styles.row}>
      {swatch}
      <span className={styles.name}>{name}</span>
      {value !== undefined && <span className={styles.value}>{value}</span>}
    </div>
  );
}
