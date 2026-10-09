import type React from 'react';
import { SkipBack, Play, Pause, SkipForward } from 'lucide-react';
import { getActiveProvider } from '../../providers';
import type { useNowPlaying } from '../../hooks/useNowPlaying';
import styles from '../../styles/SkinnyTransport.module.css';

interface Props {
  np: ReturnType<typeof useNowPlaying>;
  isAuthed: boolean;
}

/**
 * Condensed now-playing + transport strip for skinny side-panel mode.
 * The dominant-colour glow lives on the panel background (SkinnyShell); this bar
 * keeps the full PlayerBar's neutral white now-playing look. Three core buttons:
 * prev / play-pause / next.
 */
export function SkinnyTransport({ np, isAuthed }: Props) {
  const {
    displayTrack, displayArtist, cachedArt, progressPct, durationMs,
    isPlaying, elapsedLabel, durationLabel,
  } = np;

  const refresh = () => getActiveProvider().refreshPlayback();

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!durationMs) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    getActiveProvider().seek(Math.floor(pct * durationMs)).then(refresh);
  };

  return (
    <div className={styles.bar}>
      <div className={styles.art}>
        {cachedArt ? <img src={cachedArt} alt="" /> : <div className={styles.artPh}>♪</div>}
      </div>

      <div className={styles.info}>
        <div className={styles.title}>{displayTrack || '—'}</div>
        <div className={styles.artist}>{displayArtist || ''}</div>
        <div
          className={styles.progress}
          onClick={handleSeek}
          role="progressbar"
          aria-valuenow={progressPct}
        >
          <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
        </div>
        <div className={styles.timeRow}>
          <span>{elapsedLabel}</span>
          <span>{durationLabel}</span>
        </div>
      </div>

      <div className={styles.controls}>
        <button
          className={styles.btn}
          disabled={!isAuthed}
          onClick={() => getActiveProvider().skipPrev().then(refresh)}
          title="Previous"
        >
          <SkipBack size={14} />
        </button>
        <button
          className={`${styles.btn} ${styles.playBtn}`}
          disabled={!isAuthed}
          onClick={() => (isPlaying ? getActiveProvider().pause() : getActiveProvider().play()).then(refresh)}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <button
          className={styles.btn}
          disabled={!isAuthed}
          onClick={() => getActiveProvider().skipNext().then(refresh)}
          title="Next"
        >
          <SkipForward size={14} />
        </button>
      </div>
    </div>
  );
}
