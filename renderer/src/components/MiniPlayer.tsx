import { useEffect, useState } from 'react';
import type React from 'react';
import { SkipBack, Play, SkipForward, Music, X } from 'lucide-react';
import { getActiveProvider } from '../providers';
import { useAuth } from '../hooks/useAuth';
import { useGroups } from '../hooks/useGroups';
import { usePlayback } from '../hooks/usePlayback';
import { useNowPlaying } from '../hooks/useNowPlaying';
import { useQueuer } from '../hooks/useQueuer';
import { fmtTime } from '../lib/itemHelpers';
import { UserAvatar } from './common/UserAvatar';
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

  // The attribution map is broadcast when the office connection comes up, usually long before this
  // window opens, so ask for it again or "who queued it" stays blank.
  useEffect(() => {
    window.sonos.refreshAttribution().catch(() => {});
  }, []);

  const { playback } = usePlayback(activeGroupId);

  return <MiniPlayer playback={playback} isAuthed={isAuthed} />;
}

// ── Visual component ──────────────────────────────────────────────────────────

/**
 * A print and its label, always on top: the art fills the left edge, the title leads, then the
 * artist, who queued it and the time left. The transport sits over the art while the pointer is
 * on the window or focus is in it, so the label keeps the full width for the glance.
 */
function MiniPlayer({
  playback,
  isAuthed,
}: {
  playback: ReturnType<typeof usePlayback>['playback'];
  isAuthed: boolean;
}) {
  const {
    displayTrack, displayArtist, cachedArt, progressPct, durationMs, isPlaying, dominantColor,
    elapsedLabel, durationLabel, currentObjectId,
  } = useNowPlaying(playback);
  const queuer = useQueuer({ id: currentObjectId, title: displayTrack, artist: displayArtist });

  const refresh = () => getActiveProvider().refreshPlayback();

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!durationMs) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    getActiveProvider().seek(Math.floor(pct * durationMs)).then(refresh);
  };

  const pct = Math.min(100, Math.max(0, progressPct || 0));
  const remaining = durationMs > 0 ? `−${fmtTime(Math.max(0, durationMs * (1 - pct / 100)))}` : '';

  return (
    <div
      className={styles.shell}
      style={dominantColor ? ({ '--wash': dominantColor } as React.CSSProperties) : undefined}
    >
      {/* Paused keeps the transport showing: that the room has stopped is worth a glance. */}
      <div className={`${styles.art}${isPlaying ? '' : ' ' + styles.paused}`}>
        {cachedArt ? <img src={cachedArt} alt="" /> : <div className={styles.artPh}><Music size={26} /></div>}
        <div className={styles.transport}>
          <button
            className={styles.btn}
            disabled={!isAuthed}
            onClick={() => getActiveProvider().skipPrev().then(refresh)}
            title="Previous"
            aria-label="Previous"
          >
            <SkipBack size={15} fill="currentColor" />
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
            <SkipForward size={15} fill="currentColor" />
          </button>
        </div>
      </div>

      <div className={styles.label}>
        <div className={styles.head}>
          <div className={styles.title} title={displayTrack || undefined}>{displayTrack || 'Nothing playing'}</div>
          {displayArtist && <div className={styles.artist}>{displayArtist}</div>}
        </div>

        {/* With a queuer, the time left shares their row; without one (the DJ's picks) it moves
            beside the progress line, so no half-empty row is left in the middle. */}
        <div className={styles.foot}>
          {queuer && (
            <div className={styles.meta}>
              <span className={styles.queuer} title={`Queued by ${queuer.user}`}>
                <UserAvatar name={queuer.user} imageUrl={queuer.imageUrl} className={styles.queuerAvatar} />
                <span className={styles.queuerName}>{queuer.user}</span>
              </span>
              {remaining && <span className={styles.time} aria-hidden="true">{remaining}</span>}
            </div>
          )}
          <div className={styles.progressRow}>
            <div
              className={styles.progress}
              onClick={handleSeek}
              role="progressbar"
              aria-label="Track progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(pct)}
              aria-valuetext={elapsedLabel && durationLabel ? `${elapsedLabel} of ${durationLabel}` : undefined}
              title={elapsedLabel && durationLabel ? `${elapsedLabel} / ${durationLabel}` : undefined}
            >
              <div className={styles.progressTrack}>
                <div className={styles.progressFill} style={{ transform: `scaleX(${pct / 100})` }} />
              </div>
            </div>
            {!queuer && remaining && <span className={styles.time} aria-hidden="true">{remaining}</span>}
          </div>
        </div>
      </div>

      <button
        className={styles.closeBtn}
        onClick={() => window.sonos.closeMiniPlayer()}
        title="Close"
        aria-label="Close mini player"
      >
        <X size={14} />
      </button>
    </div>
  );
}
