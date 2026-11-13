import type React from 'react';
import { useNavigate } from 'react-router-dom';
import { Music } from 'lucide-react';
import type { useNowPlaying } from '../../hooks/useNowPlaying';
import { usePlaybackPosition } from '../../hooks/playbackPosition';
import { TransportButtons } from '../common/TransportButtons';
import styles from '../../styles/PhoneShell.module.css';

interface Props {
  np: ReturnType<typeof useNowPlaying>;
  isAuthed: boolean;
}

/** The hairline along the pill's foot. It reads the position store itself, so the tick re-renders only this. */
function Hairline() {
  const pct = usePlaybackPosition((p) => Math.round(Math.min(100, Math.max(0, p.progressPct || 0)) * 10) / 10);
  return (
    <span className={styles.miniTrack} aria-hidden="true">
      <span className={styles.miniFill} style={{ transform: `scaleX(${pct / 100})` }} />
    </span>
  );
}

/**
 * The phone shell's mini player: what is playing, on every page, one tap from the full Now playing page. The
 * player bar's material in a pill above the tab bar: art, title, artist, play/pause and a hairline of progress.
 */
export function PhoneMiniPlayer({ np, isAuthed }: Props) {
  const navigate = useNavigate();
  const { displayTrack, displayArtist, cachedArt, dominantColor, isPlaying } = np;

  return (
    <section
      className={`${styles.mini}${dominantColor ? ' ' + styles.miniTinted : ''}`}
      aria-label="Mini player"
      data-diag="mini"
      style={dominantColor ? ({ '--bar-tint': dominantColor } as React.CSSProperties) : undefined}
    >
      {/* Named by what it shows (title, artist) plus what it does, so the visible words are in the name. */}
      <button type="button" className={styles.miniOpen} onClick={() => void navigate('/now-playing')}>
        {cachedArt ? (
          <img className={styles.miniArt} src={cachedArt} alt="" />
        ) : (
          <span className={styles.miniArt}>
            <Music size={18} aria-hidden="true" />
          </span>
        )}
        <span className={styles.miniText}>
          <span className={styles.miniTitle}>{displayTrack || 'Nothing playing'}</span>
          {displayArtist && <span className={styles.miniArtist}>{displayArtist}</span>}
        </span>
        <span className={styles.srOnly}>, open Now playing</span>
      </button>
      <TransportButtons
        playOnly
        disabled={!isAuthed}
        isPlaying={isPlaying}
        btnClassName={styles.miniBtn}
        playClassName={styles.miniPlay}
        size={18}
        playSize={18}
        pauseSize={16}
        filled
      />
      <Hairline />
    </section>
  );
}
