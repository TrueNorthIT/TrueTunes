import type { ReactNode } from 'react';
import { useImage } from '../../hooks/useImage';
import { AddButton } from './AddButton';
import { TitleButton } from './TrackLinks';
import styles from './rows.module.css';

/** Square thumbnail that opens the item on click. Hidden from assistive tech: the title button is the real control. */
export function RowThumb({ imageUrl, onOpen }: { imageUrl?: string | null; onOpen: () => void }) {
  const art = useImage(imageUrl ?? null);
  return (
    <button type="button" className={styles.artBtn} tabIndex={-1} aria-hidden="true" onClick={onOpen}>
      {art ? <img className={styles.art} src={art} alt="" loading="lazy" /> : <span className={styles.artPh} />}
    </button>
  );
}

interface Props {
  title: string;
  /** Artist links (see ArtistLinks), shown after the title on the same line. */
  artists: ReactNode;
  imageUrl?: string | null;
  /** Muted second line, e.g. why it was picked. */
  reason?: string;
  /** Opens the album: title, thumbnail. */
  onOpen: () => void;
  onAdd?: () => void;
  addLabel?: string;
  onContextMenu?: (e: React.MouseEvent) => void;
  onMouseEnter?: () => void;
}

/** Compact track row: art, "title — artist", optional reason, and a + on hover or focus. Render inside a ul. */
export function TrackRow({ title, artists, imageUrl, reason, onOpen, onAdd, addLabel, onContextMenu, onMouseEnter }: Props) {
  return (
    <li className={`${styles.row} ${styles.track}`} onContextMenu={onContextMenu} onMouseEnter={onMouseEnter}>
      <RowThumb imageUrl={imageUrl} onOpen={onOpen} />
      <div className={styles.text}>
        <div className={styles.line}>
          <span className={styles.title}><TitleButton title={title} onOpen={onOpen} /></span>
          <span className={styles.artist}><span className={styles.dash}> — </span>{artists}</span>
        </div>
        {reason && <div className={styles.reason}>{reason}</div>}
      </div>
      {onAdd && <AddButton className={styles.add} label={addLabel ?? `Add ${title} to queue`} onClick={onAdd} />}
    </li>
  );
}
