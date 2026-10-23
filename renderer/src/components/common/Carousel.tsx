import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import styles from './Carousel.module.css';

export interface CarouselProps {
  /** Section heading (h2). Header is omitted when neither title nor actions is given, arrows then sit alone. */
  title?: ReactNode;
  /** Extra header controls (e.g. "+ New"), rendered just left of the arrows. */
  actions?: ReactNode;
  /** Gap between children, any CSS length. Default 14px. */
  gap?: string;
  /** Extra class on the outer wrapper. */
  className?: string;
  /** Style on the scroll row (e.g. a CSS custom property such as --card-size). */
  rowStyle?: CSSProperties;
  /** Optional compact search box in the header, right after the title. */
  search?: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    onFocus?: () => void;
    /** Small muted text after the input, e.g. "searching tracks…". */
    status?: ReactNode;
  };
  children: ReactNode;
}

export function Carousel({ title, actions, gap = '14px', className, rowStyle, search, children }: CarouselProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({ overflow: false, atStart: true, atEnd: true });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const overflow = el.scrollWidth - el.clientWidth > 1;
    const next = {
      overflow,
      atStart: el.scrollLeft <= 1,
      atEnd: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1,
    };
    setState((s) => (s.overflow === next.overflow && s.atStart === next.atStart && s.atEnd === next.atEnd ? s : next));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    // children changing size/count changes scrollWidth without resizing the row itself
    Array.from(el.children).forEach((c) => ro?.observe(c));
    return () => ro?.disconnect();
  }, [update, children]);

  const scroll = (dir: -1 | 1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: 'smooth' });
  };

  return (
    <div className={className}>
      <div className={styles.header}>
        {title != null && <h2 className={styles.title}>{title}</h2>}
        {search && (
          <div className={styles.search}>
            <span className={styles.searchBox}>
              <input
                type="text"
                className={styles.searchInput}
                value={search.value}
                placeholder={search.placeholder ?? 'Search'}
                aria-label={search.placeholder ?? 'Search'}
                onChange={(e) => search.onChange(e.target.value)}
                onFocus={search.onFocus}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && search.value) {
                    e.stopPropagation();
                    search.onChange('');
                  }
                }}
              />
              {search.value && (
                <button
                  type="button"
                  className={styles.searchClear}
                  aria-label="Clear search"
                  onClick={() => search.onChange('')}
                >
                  ✕
                </button>
              )}
            </span>
            {search.status != null && <span className={styles.searchStatus}>{search.status}</span>}
          </div>
        )}
        <div className={styles.controls}>
          {actions}
          {state.overflow && (
            <span className={styles.arrows}>
              <button
                type="button"
                className={styles.arrow}
                aria-label="Scroll left"
                disabled={state.atStart}
                onClick={() => scroll(-1)}
              >
                ‹
              </button>
              <button
                type="button"
                className={styles.arrow}
                aria-label="Scroll right"
                disabled={state.atEnd}
                onClick={() => scroll(1)}
              >
                ›
              </button>
            </span>
          )}
        </div>
      </div>
      <div ref={ref} className={styles.row} style={{ gap, ...rowStyle }} onScroll={update}>
        {children}
      </div>
    </div>
  );
}
