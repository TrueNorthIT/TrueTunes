import type React from 'react';
import { SkipBack, Play, SkipForward, Music } from 'lucide-react';
import { getActiveProvider } from '../../providers';
import type { useNowPlaying } from '../../hooks/useNowPlaying';
import { useQueuer } from '../../hooks/useQueuer';
import { UserAvatar } from '../common/UserAvatar';
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
  const {
    displayTrack, displayArtist, cachedArt, progressPct, durationMs, dominantColor,
    isPlaying, elapsedLabel, durationLabel, currentObjectId,
  } = np;
  const queuer = useQueuer({ id: currentObjectId, title: displayTrack, artist: displayArtist });

  const refresh = () => getActiveProvider().refreshPlayback();

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!durationMs) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    getActiveProvider().seek(Math.floor(pct * durationMs)).then(refresh);
  };

  const pct = Math.min(100, Math.max(0, progressPct || 0));

  return (
    <section
      className={styles.card}
      aria-label="Now playing"
      style={dominantColor ? ({ '--wash': dominantColor } as React.CSSProperties) : undefined}
    >
      <div className={styles.art}>
        {cachedArt ? <img src={cachedArt} alt="" /> : <div className={styles.artPh}><Music size={22} /></div>}
      </div>

      <div className={styles.info}>
        <div className={styles.title} title={displayTrack || undefined}>{displayTrack || 'Nothing playing'}</div>
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
          <button
            className={styles.btn}
            disabled={!isAuthed}
            onClick={() => getActiveProvider().skipPrev().then(refresh)}
            title="Previous"
            aria-label="Previous"
          >
            <SkipBack size={16} fill="currentColor" />
          </button>
          <button
            className={`${styles.btn} ${styles.playBtn}`}
            disabled={!isAuthed}
            onClick={() => (isPlaying ? getActiveProvider().pause() : getActiveProvider().play()).then(refresh)}
            title={isPlaying ? 'Pause' : 'Play'}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
                <rect x="2" y="1" width="4" height="12" rx="1" />
                <rect x="8" y="1" width="4" height="12" rx="1" />
              </svg>
            ) : <Play size={15} fill="currentColor" />}
          </button>
          <button
            className={styles.btn}
            disabled={!isAuthed}
            onClick={() => getActiveProvider().skipNext().then(refresh)}
            title="Next"
            aria-label="Next"
          >
            <SkipForward size={16} fill="currentColor" />
          </button>
        </div>

        <div className={styles.progressRow}>
          <span className={styles.time}>{elapsedLabel}</span>
          <div
            className={styles.progress}
            onClick={handleSeek}
            role="progressbar"
            aria-label="Track progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct)}
          >
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ transform: `scaleX(${pct / 100})` }} />
            </div>
          </div>
          <span className={styles.time}>{durationLabel}</span>
        </div>
      </div>
    </section>
  );
}
