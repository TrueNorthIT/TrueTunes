import type React from 'react';
import { Music } from 'lucide-react';
import type { useNowPlaying } from '../../hooks/useNowPlaying';
import { useQueuer } from '../../hooks/useQueuer';
import { UserAvatar } from '../common/UserAvatar';
import { LiveSeekBar, PlaybackTime } from '../common/SeekBar';
import { TransportButtons } from '../common/TransportButtons';
import styles from '../../styles/SkinnyTransport.module.css';

interface Props {
  np: ReturnType<typeof useNowPlaying>;
  isAuthed: boolean;
}

/**
 * Skinny mode's Now playing card, docked under the queue: art, title, artist and who queued it lead;
 * the transport and progress follow. Narrow windows stack the transport under the label; from 640px
 * the card is one row, like the player bar. The artwork's colour washes in from the art corner.
 */
export function SkinnyTransport({ np, isAuthed }: Props) {
  const { displayTrack, displayArtist, cachedArt, durationMs, dominantColor, isPlaying, currentObjectId } = np;
  const queuer = useQueuer({ id: currentObjectId, title: displayTrack, artist: displayArtist });

  return (
    <section
      className={styles.card}
      aria-label="Now playing"
      style={dominantColor ? ({ '--wash': dominantColor } as React.CSSProperties) : undefined}
    >
      <div className={styles.art}>
        {cachedArt ? (
          <img src={cachedArt} alt="" />
        ) : (
          <div className={styles.artPh}>
            <Music size={22} />
          </div>
        )}
      </div>

      <div className={styles.info}>
        <div className={styles.title} title={displayTrack || undefined}>
          {displayTrack || 'Nothing playing'}
        </div>
        {displayArtist && <div className={styles.artist}>{displayArtist}</div>}
        {queuer && (
          <span className={styles.queuer}>
            <UserAvatar name={queuer.user} imageUrl={queuer.imageUrl} className={styles.queuerAvatar} />
            <span className={styles.queuerName}>Queued by {queuer.user}</span>
          </span>
        )}
      </div>

      <div className={styles.controls}>
        <div className={styles.transport}>
          <TransportButtons
            disabled={!isAuthed}
            isPlaying={isPlaying}
            btnClassName={styles.btn}
            playClassName={styles.playBtn}
            size={16}
            playSize={15}
            filled
          />
        </div>

        <div className={styles.progressRow}>
          <PlaybackTime part="elapsed" className={styles.time} />
          <LiveSeekBar
            durationMs={durationMs}
            className={styles.progress}
            trackClassName={styles.progressTrack}
            fillClassName={styles.progressFill}
          />
          <PlaybackTime part="duration" className={styles.time} />
        </div>
      </div>
    </section>
  );
}
