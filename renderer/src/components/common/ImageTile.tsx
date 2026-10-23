import { useImage } from '../../hooks/useImage';
import { AddButton } from './AddButton';
import { Artwork } from './Artwork';
import styles from './ImageTile.module.css';

interface Props {
  title: string;
  sub?: string | null;
  /** A third muted line, e.g. when it was played. */
  meta?: string | null;
  imageUrl?: string | null;
  /** Artists are circles; albums and playlists are squares. */
  circular?: boolean;
  /** md: roomy shelf tile (Jump back in). sm: compact tile for three-up groups. */
  size?: 'md' | 'sm';
  onOpen: () => void;
  /** Hover prefetch. */
  onHover?: () => void;
  /** Adds a + on the art's top-right corner, revealed on hover or focus. It never opens the tile. */
  onAdd?: () => void;
  addLabel?: string;
}

/** Artwork over a caption. The tile rises 2px on hover or focus and its art picks up the lifted shadow. */
export function ImageTile({
  title,
  sub,
  meta,
  imageUrl,
  circular,
  size = 'md',
  onOpen,
  onHover,
  onAdd,
  addLabel,
}: Props) {
  const art = useImage(imageUrl ?? null);
  return (
    <div className={`${styles.tile} ${size === 'sm' ? styles.sm : styles.md}`} onMouseEnter={onHover}>
      <button type="button" className={styles.main} onClick={onOpen}>
        <span className={`${styles.art} ${circular ? styles.round : ''}`} aria-hidden="true">
          <Artwork src={art} placeholderClassName={styles.ph} lazy />
        </span>
        <span className={styles.title}>{title}</span>
        {sub && <span className={styles.sub}>{sub}</span>}
        {meta && <span className={styles.sub}>{meta}</span>}
      </button>
      {onAdd && (
        <AddButton
          variant="corner"
          className={styles.add}
          label={addLabel ?? `Add ${title} to queue`}
          onClick={onAdd}
        />
      )}
    </div>
  );
}
