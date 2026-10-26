import { useId, useState, type ReactNode } from 'react';
import { useImage } from '../../hooks/useImage';
import { withArtworkSize } from '../../lib/artworkUrl';
import { AddButton } from './AddButton';
import styles from './ArtCard.module.css';

interface Props {
  size: 'large' | 'medium';
  /** Sentence-case caption, top left. */
  label: string;
  title: string;
  /** Line under the title; may hold links (they stay clickable above the card's open button). */
  sub?: ReactNode;
  /** Album cover: always shown, so the card is never empty. */
  imageUrl?: string | null;
  /** Artist photo: fades in over the cover when it arrives, so a late photo never reshuffles the card. */
  photoUrl?: string | null;
  /** The whole card is one button. */
  onOpen: () => void;
  /** Accessible name of that button, e.g. "Open album Blue". */
  openLabel: string;
  /** Small control beside the label (an InfoTip). It sits above the open button, so it never opens the card. */
  info?: ReactNode;
  /** Something hung on the art, clear of the caption line, title and + (e.g. FanBubbles). It places itself. */
  aside?: ReactNode;
  /**
   * Keep the caption line (label + info) out of sight until the `aside` cloud is hovered or the card has focus, then
   * fade it in. It stays in the accessibility tree (and is the open button's description), and the info stays
   * focusable, so screen readers and the keyboard still reach it at rest.
   */
  reasonOnHover?: boolean;
  onAdd?: () => void;
  addLabel?: string;
  onContextMenu?: (e: React.MouseEvent) => void;
  onMouseEnter?: () => void;
  /** Layout from the page (grid placement). */
  className?: string;
}

/** A print with its label: the artwork is the card, with title and artist on a scrim over the lower part. */
export function ArtCard({
  size,
  label,
  title,
  sub,
  imageUrl,
  photoUrl,
  onOpen,
  openLabel,
  info,
  aside,
  reasonOnHover,
  onAdd,
  addLabel,
  onContextMenu,
  onMouseEnter,
  className,
}: Props) {
  // Shown big, so ask the service for a bigger image.
  const px = size === 'large' ? 1200 : 800;
  const cover = useImage(imageUrl ? withArtworkSize(imageUrl, px) : null);
  const photo = useImage(photoUrl ? withArtworkSize(photoUrl, px) : null);
  // The cover sits under the photo only while the photo fades in. Left stacked, the two layers can drift a pixel
  // apart while scrolling and the cover shows through at the edges.
  const [photoInFor, setPhotoInFor] = useState<string | null>(null);
  const photoIn = photo !== null && photoInFor === photo;
  const setPhotoIn = (v: boolean) => setPhotoInFor(v ? photo : null);
  const labelId = useId();
  return (
    <div
      className={[
        styles.card,
        size === 'large' ? styles.large : styles.medium,
        reasonOnHover ? styles.reasonOnHover : null,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      onContextMenu={onContextMenu}
      onMouseEnter={onMouseEnter}
    >
      {cover && !photoIn && <img className={styles.fill} src={cover} alt="" />}
      {photo && (
        <img
          className={`${styles.fill} ${styles.photo}`}
          src={photo}
          alt=""
          onAnimationEnd={() => setPhotoIn(true)}
          onLoad={() => {
            if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) setPhotoIn(true);
          }}
        />
      )}
      <button
        type="button"
        className={styles.cover}
        aria-label={openLabel}
        aria-describedby={reasonOnHover ? labelId : undefined}
        onClick={onOpen}
      />
      <div className={styles.top}>
        <span className={styles.label} id={labelId}>
          {label}
        </span>
        {info}
      </div>
      {aside}
      <div className={styles.caption}>
        <div className={styles.title}>{title}</div>
        {sub != null && <div className={styles.sub}>{sub}</div>}
      </div>
      {onAdd && (
        <AddButton variant="art" className={styles.add} label={addLabel ?? `Add ${title} to queue`} onClick={onAdd} />
      )}
    </div>
  );
}
