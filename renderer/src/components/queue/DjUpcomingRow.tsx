import { Disc3 } from 'lucide-react';
import { useImage } from '../../hooks/useImage';
import { PickInfoTip } from '../common/PickInfoTip';
import { Artwork } from '../common/Artwork';
import styles from '../../styles/QueueSidebar.module.css';

interface Props {
  track: DjTrack;
  /** Dimmed further while autoplay is paused — these are hypothetical then. */
  idle: boolean;
  /** The signed-in display name, shown as "You" in the pick's explanation. */
  viewer?: string | null;
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
export function DjUpcomingRow({ track, idle, viewer }: Props) {
  const art = useImage(track.imageUrl ?? null);

  return (
    <div className={[styles.row, styles.djRow, idle ? styles.djRowIdle : ''].filter(Boolean).join(' ')}>
      <div className={styles.artWrap}>
        <Artwork src={art} className={styles.art} placeholderClassName={styles.artPh} lazy />
      </div>
      <div className={styles.text}>
        <div className={styles.name}>{track.trackName}</div>
        <div className={styles.subLine}>
          <span className={styles.sub}>{track.artist}</span>
        </div>
      </div>
      {/* Where a person's avatar sits on a real row: the DJ icon, which explains the pick. */}
      <PickInfoTip
        className={styles.djPick}
        icon={<Disc3 size={14} aria-hidden="true" />}
        because={track.because}
        fans={track.fans}
        trackFans={track.trackFans}
        artist={track.artist}
        viewer={viewer}
        trackName={track.trackName}
        kind="played"
      />
      <span className={styles.srOnly}>{track.because}</span>
    </div>
  );
}
