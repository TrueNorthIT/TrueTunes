import { useEffect, useState } from 'react';
import { SkipBack, Play, Pause, SkipForward } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useGroups } from '../hooks/useGroups';
import { usePlayback } from '../hooks/usePlayback';
import { useNowPlaying } from '../hooks/useNowPlaying';
import styles from '../styles/MiniPlayer.module.css';

// ── Shell ─────────────────────────────────────────────────────────────────────

export function MiniPlayerShell() {
  const isAuthed = useAuth();
  const groups   = useGroups();
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  useEffect(() => {
    if (groups.length > 0 && !activeGroupId) setActiveGroupId(groups[0].id);
  }, [groups, activeGroupId]);

  const { playback } = usePlayback(activeGroupId);

  return <MiniPlayer playback={playback} isAuthed={isAuthed} />;
}

// ── Visual component ──────────────────────────────────────────────────────────

function MiniPlayer({ playback, isAuthed }: {
  playback: ReturnType<typeof usePlayback>['playback'];
  isAuthed: boolean;
}) {
  const {
    displayTrack, displayArtist, cachedArt,
    progressPct, isPlaying, dominantColor,
  } = useNowPlaying(playback);

  const refresh = () => window.sonos.refreshPlayback();

  const shellStyle = dominantColor
    ? { '--glow': `rgba(${dominantColor},0.25)` } as React.CSSProperties
    : undefined;

  return (
    <>
      {/* SVG liquid-glass filter — hidden, referenced by CSS */}
      <svg style={{ display: 'none' }} aria-hidden="true">
        <defs>
          <filter id="liquid-glass" x="-8%" y="-8%" width="116%" height="116%">
            <feTurbulence type="fractalNoise" baseFrequency="0.018 0.012" numOctaves="2" seed="42" result="noise" />
            <feGaussianBlur in="noise" stdDeviation="0.5" result="softNoise" />
            <feDisplacementMap in="SourceGraphic" in2="softNoise" scale="22" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>

      <div className={styles.shell} style={shellStyle}>
        {/* Glass backdrop layer */}
        <div className={styles.glass} />

        {/* Content (above glass) */}
        <div className={styles.content}>
          {/* Album art */}
          <div className={styles.art}>
            {cachedArt
              ? <img src={cachedArt} alt="" />
              : <div className={styles.artPh}>♪</div>}
          </div>

          {/* Track info + progress */}
          <div className={styles.info}>
            <div className={styles.title}>{displayTrack || '—'}</div>
            <div className={styles.artist}>{displayArtist || ''}</div>
            <div className={styles.progress}>
              <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
            </div>
          </div>

          {/* Controls */}
          <div className={styles.controls}>
            <button className={styles.btn} disabled={!isAuthed}
              onClick={() => window.sonos.skipPrev().then(refresh)} title="Previous">
              <SkipBack size={13} />
            </button>
            <button className={`${styles.btn} ${styles.playBtn}`} disabled={!isAuthed}
              onClick={() => (isPlaying ? window.sonos.pause() : window.sonos.play()).then(refresh)}
              title={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button className={styles.btn} disabled={!isAuthed}
              onClick={() => window.sonos.skipNext().then(refresh)} title="Next">
              <SkipForward size={13} />
            </button>
          </div>

          {/* Close */}
          <button className={styles.closeBtn}
            onClick={() => window.sonos.closeMiniPlayer()} title="Close">
            ✕
          </button>
        </div>
      </div>
    </>
  );
}
