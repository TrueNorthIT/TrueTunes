import type { ReactNode } from 'react';
import { AddButton } from './AddButton';
import { RowThumb } from './TrackRow';
import { TitleButton } from './TrackLinks';
import styles from './rows.module.css';

interface Props {
  rank: number;
  title: string;
  artists: ReactNode;
  imageUrl?: string | null;
  /** The right-aligned figure. Optional when `meta` is given. */
  count?: number;
  /** Replaces the count in the right-aligned cell (e.g. a duration). Skips the count tooltip. */
  meta?: ReactNode;
  /** Tooltip on the count. */
  countLabel?: string;
  /** Replaces the zero-padded rank in the first cell (e.g. a now-playing indicator). */
  rankSlot?: ReactNode;
  selected?: boolean;
  /** Titles take the on-art colour, as on hover. */
  playing?: boolean;
  /** Opens the album: title, thumbnail. */
  onOpen: () => void;
  onClick?: (e: React.MouseEvent) => void;
  /** Makes the row draggable. */
  onDragStart?: (e: React.DragEvent) => void;
  /** Without it the + column keeps its width, so the columns stay aligned. */
  onAdd?: () => void;
  addLabel?: string;
  onContextMenu?: (e: React.MouseEvent) => void;
  onMouseEnter?: () => void;
}

/** Ranked row: zero-padded rank, art, title, artists, a right-aligned count and a + on hover. Render inside an ol. */
export function ChartRow({
  rank, title, artists, imageUrl, count, meta, countLabel, rankSlot, selected, playing,
  onOpen, onClick, onDragStart, onAdd, addLabel, onContextMenu, onMouseEnter,
}: Props) {
  return (
    <li
      className={[
        styles.row, styles.chart,
        selected ? styles.selected : '',
        playing ? styles.playing : '',
        onDragStart ? styles.draggable : '',
      ].filter(Boolean).join(' ')}
      draggable={onDragStart ? true : undefined}
      onClick={onClick}
      onDragStart={onDragStart}
      onContextMenu={onContextMenu}
      onMouseEnter={onMouseEnter}
    >
      <span className={styles.rank}>{rankSlot ?? String(rank).padStart(2, '0')}</span>
      <span className={styles.titleCell}>
        <RowThumb imageUrl={imageUrl} onOpen={onOpen} />
        <span className={styles.chartTitle}><TitleButton title={title} onOpen={onOpen} /></span>
      </span>
      <span className={styles.chartArtist}>{artists}</span>
      <span className={styles.plays} title={meta !== undefined ? undefined : (countLabel ?? `${count ?? 0} times queued`)}>
        {meta !== undefined ? meta : count}
      </span>
      {onAdd ? (
        <AddButton className={styles.add} label={addLabel ?? `Add ${title} to queue`} onClick={onAdd} />
      ) : (
        <span className={styles.addSpacer} />
      )}
    </li>
  );
}

/** Column labels above a ChartRow list; decorative, the rows carry the meaning. */
export function ChartHead({ labels = ['#', 'Title', 'Artist', 'Plays'] }: { labels?: [string, string, string, string] }) {
  return (
    <div className={styles.chartHead} aria-hidden="true">
      <span>{labels[0]}</span>
      <span>{labels[1]}</span>
      <span>{labels[2]}</span>
      <span className={styles.plays}>{labels[3]}</span>
    </div>
  );
}
