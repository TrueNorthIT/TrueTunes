import type { CSSProperties, ReactNode } from 'react';
import styles from './HeroBand.module.css';

interface Props {
  /** The artwork cell: an img, a mosaic, a placeholder. Fills a 16em rounded square. */
  art: ReactNode;
  /** Small muted line above the title: "Album", "Playlist". */
  kind?: string;
  /** The h1's content. May be an input while renaming. */
  title: ReactNode;
  /** Makes the title click-to-edit (cursor, hover, tooltip). */
  onTitleClick?: () => void;
  titleHint?: string;
  /** `r, g, b` of the artwork's dominant colour, washed in from the top left. Falls back to the tint. */
  wash?: string | null;
  /** Lines under the title: artist, meta, actions. */
  children?: ReactNode;
  /** A chip pinned top right (e.g. "Queued here 3 times"), as Home's Now Playing card pins its queuer. */
  corner?: ReactNode;
}

/**
 * The header band of a detail page, in Home's Now Playing language: large sharp art on a lit wall with
 * the artwork's colour washed across it. Sized in em: put it inside a .page-scale root that is a container.
 */
export function HeroBand({ art, kind, title, onTitleClick, titleHint, wash, children, corner }: Props) {
  const style: CSSProperties | undefined = wash
    ? { background: `radial-gradient(120% 150% at 0% 0%, rgba(${wash}, 0.3), transparent 65%), var(--surface-hi)` }
    : undefined;
  return (
    <header className={styles.header} style={style}>
      <div className={styles.artWrap}>{art}</div>
      <div className={styles.meta}>
        {kind && <span className={styles.kind}>{kind}</span>}
        <h1
          className={`${styles.title}${onTitleClick ? ' ' + styles.editable : ''}`}
          onClick={onTitleClick}
          title={onTitleClick ? titleHint : undefined}
        >
          {title}
        </h1>
        {children}
      </div>
      {corner && <div className={styles.corner}>{corner}</div>}
    </header>
  );
}
