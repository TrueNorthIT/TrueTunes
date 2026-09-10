import { useImage } from '../../hooks/useImage';
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
      {/* Empty spacer where the drag handle sits, so the art lines up with the
          rows above without implying these can be dragged. */}
      <div className={styles.dragHandle} aria-hidden="true" />
      <div className={styles.artWrap}>
        {art ? (
          <img className={styles.art} src={art} alt="" loading="lazy" />
        ) : (
          <div className={styles.artPh}>♪</div>
        )}
      </div>
      <div className={styles.text}>
        <div className={styles.name}>{track.trackName}</div>
        <div className={styles.sub}>{track.artist}</div>
        <div className={styles.attribution}>{track.because}</div>
      </div>
    </div>
  );
}
