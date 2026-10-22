import { useId, type CSSProperties, type ReactNode } from 'react';
import styles from './SectionCard.module.css';

interface Props {
  /** Section heading (h2). Without one the card has no header row. */
  title?: ReactNode;
  /** Sits right after the title, e.g. a row of faces. */
  headContent?: ReactNode;
  /** Right-aligned in the header: a button, or a SeeAll. */
  actions?: ReactNode;
  /** Lit wall plus the artwork wash: the hero cards. */
  featured?: boolean;
  /** `r, g, b` of the artwork's dominant colour, for the featured wash. Falls back to the tint. */
  wash?: string | null;
  /** Layout (margins, grid placement) from the page; the card owns only its own surface. */
  className?: string;
  children: ReactNode;
}

/** The soft, borderless tonal card every page section sits on. Sized in em: put it inside a .page-scale root. */
export function SectionCard({ title, headContent, actions, featured, wash, className, children }: Props) {
  const titleId = useId();
  return (
    <section
      className={[styles.card, featured ? styles.featured : '', className].filter(Boolean).join(' ')}
      style={wash ? ({ '--wash': wash } as CSSProperties) : undefined}
      aria-labelledby={title != null ? titleId : undefined}
    >
      {title != null && (
        <div className={styles.head}>
          <h2 id={titleId} className={styles.title}>{title}</h2>
          {headContent}
          {actions != null && <div className={styles.actions}>{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Quiet text link for a section header: "See all". */
export function SeeAll({ label = 'See all', onClick }: { label?: string; onClick: () => void }) {
  return (
    <button type="button" className={styles.seeAll} onClick={onClick}>
      {label}
    </button>
  );
}
