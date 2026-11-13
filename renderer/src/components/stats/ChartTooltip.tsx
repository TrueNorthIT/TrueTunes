import { useEffect } from 'react';
import type { PointerEvent, ReactNode, RefObject } from 'react';
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

/**
 * A touch has no hover: its pointer "leaves" the moment the finger lifts, which would close the readout just as it
 * opened. So a touch leaves it open (use as the `onPointerLeave`), and a tap anywhere outside the chart closes it.
 */
export const clearUnlessTouch = (clear: () => void) => (e: PointerEvent) => {
  if (e.pointerType !== 'touch') clear();
};

export function useDismissOnOutsideTap(ref: RefObject<Element | null>, open: boolean, clear: () => void) {
  useEffect(() => {
    if (!open) return;
    const away = (e: globalThis.PointerEvent) => {
      if (e.pointerType === 'touch' && !ref.current?.contains(e.target as Node)) clear();
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [ref, open, clear]);
}
