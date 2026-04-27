import { useEffect, useState } from 'react';
import type React from 'react';
import { SkipBack, Play, Pause, SkipForward } from 'lucide-react';
import { getActiveProvider } from '../providers';
import { useAuth } from '../hooks/useAuth';
import { useGroups } from '../hooks/useGroups';
import { usePlayback } from '../hooks/usePlayback';
import { useNowPlaying } from '../hooks/useNowPlaying';
import styles from '../styles/MiniPlayer.module.css';

// ── Shell ─────────────────────────────────────────────────────────────────────

export function MiniPlayerShell() {
  const isAuthed = useAuth();
  const groups = useGroups();
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  // Mirror App.tsx's active-group resolution so the mini window controls the
  // same group the user has selected in the main window, not just groups[0].
  useEffect(() => {
    if (groups.length === 0 || activeGroupId) return;
    getActiveProvider().getActiveGroup().then((savedCoordinatorId) => {
      const match = savedCoordinatorId ? groups.find((g) => g.coordinatorId === savedCoordinatorId) : null;
      setActiveGroupId(match ? match.id : groups[0].id);
    }).catch(() => setActiveGroupId(groups[0].id));
  }, [groups, activeGroupId]);

  const { playback } = usePlayback(activeGroupId);

  return <MiniPlayer playback={playback} isAuthed={isAuthed} />;
}

// ── Visual component ──────────────────────────────────────────────────────────

function MiniPlayer({
  playback,
  isAuthed,
}: {
  playback: ReturnType<typeof usePlayback>['playback'];
  isAuthed: boolean;
}) {
  const { displayTrack, displayArtist, cachedArt, progressPct, durationMs, isPlaying, dominantColor, elapsedLabel, durationLabel } = useNowPlaying(playback);

  const refresh = () => getActiveProvider().refreshPlayback();

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!durationMs) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    getActiveProvider().seek(Math.floor(pct * durationMs)).then(refresh);
  };

  const shellStyle: React.CSSProperties | undefined = dominantColor
    ? {
        background: `linear-gradient(105deg, rgba(${dominantColor}, 0.18) 0%, rgba(255,255,255,0.03) 60%), rgba(14, 14, 20, 0.96)`,
        ['--accent' as string]: `rgba(${dominantColor},0.85)`,
      }
    : undefined;

  return (
    <div className={styles.shell} style={shellStyle}>
      <div className={styles.content}>
        {/* Album art */}
        <div className={styles.art}>
          {cachedArt ? <img src={cachedArt} alt="" /> : <div className={styles.artPh}>♪</div>}
        </div>

        {/* Track info + progress */}
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

        {/* Controls */}
        <div className={styles.controls}>
          <button
            className={styles.btn}
            disabled={!isAuthed}
            onClick={() => getActiveProvider().skipPrev().then(refresh)}
            title="Previous"
          >
            <SkipBack size={13} />
          </button>
          <button
            className={`${styles.btn} ${styles.playBtn}`}
            disabled={!isAuthed}
            onClick={() => (isPlaying ? getActiveProvider().pause() : getActiveProvider().play()).then(refresh)}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button
            className={styles.btn}
            disabled={!isAuthed}
            onClick={() => getActiveProvider().skipNext().then(refresh)}
            title="Next"
          >
            <SkipForward size={13} />
          </button>
        </div>

        {/* Close */}
        <button className={styles.closeBtn} onClick={() => window.sonos.closeMiniPlayer()} title="Close">
          ✕
        </button>
      </div>
    </div>
  );
}
