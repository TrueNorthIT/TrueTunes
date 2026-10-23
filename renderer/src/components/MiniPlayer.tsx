import { useEffect, useState } from 'react';
import type React from 'react';
import { Music, X } from 'lucide-react';
import { getActiveProvider } from '../providers';
import { useAuth } from '../hooks/useAuth';
import { useGroups } from '../hooks/useGroups';
import { usePlayback } from '../hooks/usePlayback';
import { useNowPlaying } from '../hooks/useNowPlaying';
import { useQueuer } from '../hooks/useQueuer';
import { fmtTime } from '../lib/itemHelpers';
import { UserAvatar } from './common/UserAvatar';
import { SeekBar } from './common/SeekBar';
import { TransportButtons } from './common/TransportButtons';
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
          <TransportButtons
            disabled={!isAuthed}
            isPlaying={isPlaying}
            btnClassName={styles.btn}
            playClassName={styles.playBtn}
            size={15}
            playSize={15}
            filled
          />
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
            <SeekBar
              progressPct={progressPct}
              durationMs={durationMs}
              elapsedLabel={elapsedLabel}
              durationLabel={durationLabel}
              className={styles.progress}
              trackClassName={styles.progressTrack}
              fillClassName={styles.progressFill}
              title={elapsedLabel && durationLabel ? `${elapsedLabel} / ${durationLabel}` : undefined}
            />
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
