import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { ChartTooltip } from './ChartTooltip';
import type { Tip } from './ChartTooltip';
import { RAMP } from './ramp';
import styles from './Heatmap.module.css';

export interface HeatRow {
  key: string;
  /** The row's name; sits in a left column that stays put while the grid scrolls. */
  label: ReactNode;
  /** One fill per column (a colour from RAMP); null is an empty cell. */
  cells: (string | null)[];
}

interface Props {
  /** Column headings. Use '' to thin them: a heading only shows where there is text. */
  columns: string[];
  rows: HeatRow[];
  /** Accessible name and tooltip content for a cell. */
  cellLabel: (row: number, col: number) => string;
  renderTip: (row: number, col: number) => ReactNode;
  /** Ramp legend: the low end, the high end and what an empty cell means. */
  legend: { lo: ReactNode; hi: ReactNode; empty: ReactNode };
  /** Narrowest a column may get before the grid scrolls sideways. Default: fit the width. */
  minCell?: string;
  cellHeight?: string;
  /** Opens scrolled to the latest column. */
  startAtEnd?: boolean;
  ariaLabel?: string;
  className?: string;
}

/** Row-by-column heatmap with its own hover readout and ramp legend. Sized in em: inside a .page-scale root. */
export function Heatmap({
  columns,
  rows,
  cellLabel,
  renderTip,
  legend,
  minCell = '0px',
  cellHeight = '1.4em',
  startAtEnd,
  ariaLabel,
  className,
}: Props) {
  const [tip, setTip] = useState<Tip | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && startAtEnd) el.scrollLeft = el.scrollWidth;
  }, [startAtEnd, columns.length]);

  function show(e: React.PointerEvent, r: number, c: number) {
    const wrap = wrapRef.current?.getBoundingClientRect();
    const cell = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (!wrap) return;
    setTip({
      x: Math.max(0, Math.min(cell.left - wrap.left + cell.width + 6, wrap.width - 200)),
      y: cell.top - wrap.top - 6,
      content: renderTip(r, c),
    });
  }

  return (
    <div
      ref={wrapRef}
      className={[styles.frame, className].filter(Boolean).join(' ')}
      onPointerLeave={() => setTip(null)}
    >
      <div
        className={styles.body}
        style={{ '--cols': columns.length, '--min-cell': minCell, '--cell-h': cellHeight } as CSSProperties}
      >
        <div className={styles.names}>
          <div className={styles.colHead} />
          {rows.map((r) => (
            <div key={r.key} className={styles.rowHead}>
              <div className={styles.rowName}>{r.label}</div>
            </div>
          ))}
        </div>
        <div ref={scrollRef} className={styles.scroll}>
          <div className={styles.grid} role={ariaLabel ? 'img' : undefined} aria-label={ariaLabel}>
            {columns.map((c, i) => (
              <div key={i} className={styles.colHead}>
                {c && <span>{c}</span>}
              </div>
            ))}
            {rows.map((r, ri) =>
              r.cells.map((fill, ci) => (
                <div
                  key={`${r.key}|${ci}`}
                  className={fill === null ? styles.empty : styles.cell}
                  style={fill === null ? undefined : { background: fill }}
                  onPointerEnter={(e) => show(e, ri, ci)}
                  aria-label={cellLabel(ri, ci)}
                />
              ))
            )}
          </div>
        </div>
      </div>
      <div className={styles.legend} aria-hidden="true">
        <span>{legend.lo}</span>
        <span className={styles.rampBar} style={{ background: `linear-gradient(to right, ${RAMP.join(',')})` }} />
        <span>{legend.hi}</span>
        <span className={styles.emptyKey} />
        <span>{legend.empty}</span>
      </div>
      <ChartTooltip tip={tip} />
    </div>
  );
}
