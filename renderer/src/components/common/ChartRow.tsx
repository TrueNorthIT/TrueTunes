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
  count: number;
  /** Tooltip on the count. */
  countLabel?: string;
  /** Opens the album: title, thumbnail. */
  onOpen: () => void;
  /** Without it the + column keeps its width, so the columns stay aligned. */
  onAdd?: () => void;
  addLabel?: string;
  onContextMenu?: (e: React.MouseEvent) => void;
  onMouseEnter?: () => void;
}

/** Ranked row: zero-padded rank, art, title, artists, a right-aligned count and a + on hover. Render inside an ol. */
export function ChartRow({
  rank, title, artists, imageUrl, count, countLabel, onOpen, onAdd, addLabel, onContextMenu, onMouseEnter,
}: Props) {
  return (
    <li className={`${styles.row} ${styles.chart}`} onContextMenu={onContextMenu} onMouseEnter={onMouseEnter}>
      <span className={styles.rank}>{String(rank).padStart(2, '0')}</span>
      <span className={styles.titleCell}>
        <RowThumb imageUrl={imageUrl} onOpen={onOpen} />
        <span className={styles.chartTitle}><TitleButton title={title} onOpen={onOpen} /></span>
      </span>
      <span className={styles.chartArtist}>{artists}</span>
      <span className={styles.plays} title={countLabel ?? `${count} times queued`}>{count}</span>
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
