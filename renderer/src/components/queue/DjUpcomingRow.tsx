import { Disc3 } from 'lucide-react';
import { useImage } from '../../hooks/useImage';
import { Artwork } from '../common/Artwork';
import styles from '../../styles/QueueSidebar.module.css';

interface Props {
  track: DjTrack;
  /** Dimmed further while autoplay is paused — these are hypothetical then. */
  idle: boolean;
}

/**
 * An upcoming DJ pick, rendered to match the real queue rows above it.
 *
 * Deliberately reuses `QueueSidebar.module.css` rather than defining its own
 * look: these sit directly under the queue and any difference in art size or
 * text rhythm reads as a rendering bug rather than a distinction.
 *
 * What it does NOT do is behave like a queue row — no drag, no selection, no
 * double-click-to-play. Only the first of these is actually in the Sonos queue,
 * so offering to reorder or skip to them would be a lie.
 */
export function DjUpcomingRow({ track, idle }: Props) {
  const art = useImage(track.imageUrl ?? null);

  return (
    <div
      className={[styles.row, styles.djRow, idle ? styles.djRowIdle : ''].filter(Boolean).join(' ')}
      title={track.because}
    >
      <div className={styles.artWrap}>
        <Artwork src={art} className={styles.art} placeholderClassName={styles.artPh} lazy />
      </div>
      <div className={styles.text}>
        <div className={styles.name}>{track.trackName}</div>
        <div className={styles.subLine}>
          <span className={styles.sub}>{track.artist}</span>
        </div>
      </div>
      {/* Where a person's avatar sits on a real row: the DJ, with its reason as the name. */}
      <span className={styles.djPick} title={track.because}>
        <Disc3 size={14} aria-hidden="true" />
        <span className={styles.srOnly}>{track.because}</span>
      </span>
    </div>
  );
}
