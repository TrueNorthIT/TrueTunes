import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import styles from './InfoTip.module.css';

interface Props {
  /** Accessible name of the button, e.g. "Why this pick". */
  label: string;
  /** The tooltip content. */
  children: ReactNode;
  /** Positioning from the page. */
  className?: string;
  /** Replaces the default info icon. */
  icon?: ReactNode;
}

const GAP = 8;
const MARGIN = 8;

/**
 * A small info button with a tooltip: shown on hover and focus, hidden on leave, blur and Escape.
 * The tooltip is portalled to the body with fixed placement, so a card's `overflow: hidden` can't clip it
 * and it is kept on screen. Clicks stop here, so it never opens the card it sits on.
 */
export function InfoTip({ label, children, className, icon }: Props) {
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const open = hover || focus;

  const hide = useCallback(() => {
    setHover(false);
    setFocus(false);
  }, []);

  // Escape works wherever focus is, including after a hover-open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, hide]);

  // Below the button, flipped above when it won't fit; clamped inside the window.
  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- measures the laid-out DOM, which only exists after commit
    if (!open || !btn.current || !tip.current) return setPos(null);
    const b = btn.current.getBoundingClientRect();
    const t = tip.current.getBoundingClientRect();
    const below = b.bottom + GAP + t.height <= window.innerHeight - MARGIN;
    const top = below ? b.bottom + GAP : Math.max(MARGIN, b.top - GAP - t.height);
    const left = Math.min(Math.max(MARGIN, b.left + b.width / 2 - t.width / 2), window.innerWidth - t.width - MARGIN);
    setPos({ left, top });
  }, [open]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={[styles.btn, className].filter(Boolean).join(' ')}
        aria-label={label}
        aria-describedby={open ? id : undefined}
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
      >
        {icon ?? <Info size={14} aria-hidden="true" />}
      </button>
      {open &&
        createPortal(
          <div
            ref={tip}
            id={id}
            role="tooltip"
            className={styles.tip}
            style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}
          >
            {children}
          </div>,
          document.body
        )}
    </>
  );
}
