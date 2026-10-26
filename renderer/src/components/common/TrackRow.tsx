import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useImage } from '../../hooks/useImage';
import { AddButton } from './AddButton';
import { ExplicitBadge } from './ExplicitBadge';
import { TitleButton } from './TrackLinks';
import { UserAvatar } from './UserAvatar';
import styles from './rows.module.css';

/** Square thumbnail that opens the item on click. Hidden from assistive tech: the title button is the real control. */
export function RowThumb({ imageUrl, onOpen }: { imageUrl?: string | null; onOpen?: () => void }) {
  const art = useImage(imageUrl ?? null);
  const inner = art ? (
    <img className={styles.art} src={art} alt="" loading="lazy" />
  ) : (
    <span className={styles.artPh} />
  );
  if (!onOpen)
    return (
      <span className={styles.artBtn} aria-hidden="true">
        {inner}
      </span>
    );
  return (
    <button type="button" className={styles.artBtn} tabIndex={-1} aria-hidden="true" onClick={onOpen}>
      {inner}
    </button>
  );
}

interface Props {
  title: string;
  /** Artist links (see ArtistLinks), shown after the title on the same line. Omit to show the title alone. */
  artists?: ReactNode;
  imageUrl?: string | null;
  /** Muted second line, e.g. why it was picked. */
  reason?: string;
  /** Opens the album: title, thumbnail. Without it the title and thumbnail are plain. */
  onOpen?: () => void;
  onAdd?: () => void;
  addLabel?: string;
  onContextMenu?: (e: React.MouseEvent) => void;
  onMouseEnter?: () => void;

  /** Leading cell, e.g. the track number. Right-aligned, tabular. */
  lead?: ReactNode;
  /** false drops the thumbnail (an album's tracks all share one cover). Default true. */
  showArt?: boolean;
  explicit?: boolean;
  /** A muted column before the end of the row, e.g. the album. */
  aside?: ReactNode;
  /** Right-aligned figure, e.g. the duration. */
  trailing?: ReactNode;
  /** Who added or queued it: a small avatar named "Added by X" (or `label`). */
  attribution?: { user: string; imageUrl?: string | null; label?: string; onOpen: () => void };
  /** Adds a quiet × at the end of the row, shown on hover. */
  onRemove?: () => void;
  removeLabel?: string;
  selected?: boolean;
  playing?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  /** Making the row draggable: set onDragStart. `handle` shows the grip on hover and makes room for it. */
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  handle?: boolean;
}

/**
 * Compact track row: art, "title — artist", optional reason, and a + on hover or focus. Render inside a ul.
 * The optional props cover numbered album rows, and playlist rows with who added what, drag-reorder and remove.
 */
export function TrackRow({
  title,
  artists,
  imageUrl,
  reason,
  onOpen,
  onAdd,
  addLabel,
  onContextMenu,
  onMouseEnter,
  lead,
  showArt = true,
  explicit,
  aside,
  trailing,
  attribution,
  onRemove,
  removeLabel,
  selected,
  playing,
  onClick,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  handle,
}: Props) {
  return (
    <li
      className={[
        styles.row,
        styles.track,
        selected ? styles.selected : '',
        playing ? styles.playing : '',
        onDragStart ? styles.draggable : '',
        handle ? styles.withHandle : '',
      ]
        .filter(Boolean)
        .join(' ')}
      draggable={onDragStart ? true : undefined}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={onMouseEnter}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {handle && (
        <span className={styles.handle} aria-hidden="true">
          ⠿
        </span>
      )}
      {lead != null && <span className={styles.lead}>{lead}</span>}
      {showArt && <RowThumb imageUrl={imageUrl} onOpen={onOpen} />}
      <div className={styles.text}>
        <div className={styles.line}>
          <span className={styles.title} title={title}>
            {onOpen ? <TitleButton title={title} onOpen={onOpen} /> : title}
            {explicit && <ExplicitBadge />}
          </span>
          {artists != null && (
            <span className={styles.artist}>
              <span className={styles.dash} aria-hidden="true">
                {' '}
                ·{' '}
              </span>
              {artists}
            </span>
          )}
        </div>
        {reason && <div className={styles.reason}>{reason}</div>}
      </div>
      {aside != null && <div className={styles.aside}>{aside}</div>}
      {attribution && (
        <button
          type="button"
          className={styles.who}
          aria-label={attribution.label ?? `Added by ${attribution.user}`}
          title={attribution.label ?? `Added by ${attribution.user}`}
          onClick={(e) => {
            e.stopPropagation();
            attribution.onOpen();
          }}
        >
          <UserAvatar name={attribution.user} imageUrl={attribution.imageUrl} className={styles.whoAvatar} />
        </button>
      )}
      {trailing != null && <span className={styles.trailing}>{trailing}</span>}
      {onAdd && <AddButton className={styles.add} label={addLabel ?? `Add ${title} to queue`} onClick={onAdd} />}
      {onRemove && (
        <button
          type="button"
          className={`${styles.remove} ${styles.add}`}
          title="Remove"
          aria-label={removeLabel ?? `Remove ${title}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </li>
  );
}
