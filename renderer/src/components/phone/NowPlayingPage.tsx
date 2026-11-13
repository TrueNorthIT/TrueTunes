import type React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  Heart,
  ListMusic,
  MicVocal,
  Music,
  Repeat,
  Repeat1,
  Shuffle,
  Volume,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { useNowPlaying } from '../../hooks/useNowPlaying';
import type { PlaybackState } from '../../hooks/usePlayback';
import { useDisplayName } from '../../hooks/useDisplayName';
import { useFavourite } from '../../hooks/usePlaylists';
import { useOpenItem } from '../../hooks/useOpenItem';
import { usePlayModeToggles, useVolumeControl } from '../../hooks/usePlayerControls';
import { useQueuer } from '../../hooks/useQueuer';
import { ExplicitBadge } from '../common/ExplicitBadge';
import { PillButton } from '../common/PillButton';
import { QueuerChip } from '../common/QueuerChip';
import { LiveSeekBar, PlaybackTime } from '../common/SeekBar';
import { TransportButtons } from '../common/TransportButtons';
import styles from '../../styles/PhoneNowPlaying.module.css';

interface Props {
  isAuthed: boolean;
  playback: PlaybackState;
  np: ReturnType<typeof useNowPlaying>;
  /** After a shuffle change the queue's order is new. */
  onShuffle: () => void;
}

function VolumeGlyph({ volume }: { volume: number }) {
  const Icon = volume === 0 ? VolumeX : volume < 33 ? Volume : volume < 66 ? Volume1 : Volume2;
  return <Icon size={20} aria-hidden="true" />;
}

/** The room's volume as one long slider: the player bar's popover, laid flat for a thumb. */
function VolumeRow({ volume, disabled }: { volume: number; disabled: boolean }) {
  const { localVol, muted, setVolume, toggleMute, startDrag } = useVolumeControl(volume, { sendOnUnmount: true });
  return (
    <div className={styles.volume}>
      <button
        type="button"
        className={styles.ctrl}
        disabled={disabled}
        onClick={toggleMute}
        aria-label={muted ? 'Unmute' : 'Mute'}
      >
        <VolumeGlyph volume={localVol} />
      </button>
      <input
        className={styles.slider}
        type="range"
        aria-label="Volume"
        min={0}
        max={100}
        value={localVol}
        disabled={disabled}
        style={{ '--fill': `${localVol}%` } as React.CSSProperties}
        onPointerDown={startDrag}
        onChange={(e) => setVolume(Number(e.target.value))}
      />
      <span className={styles.volumePct} aria-hidden="true">
        {localVol}
      </span>
    </div>
  );
}

/**
 * The phone shell's Now playing page (/now-playing): everything the desktop's player bar and Now playing card
 * do, at thumb size. The art takes whatever height is left, so the controls never leave the screen. Opened from
 * the mini player; Back (or the chevron) closes it.
 */
export function NowPlayingPage({ isAuthed, playback, np, onShuffle }: Props) {
  const navigate = useNavigate();
  const openItem = useOpenItem();
  const displayName = useDisplayName();
  const {
    displayTrack,
    displayArtist,
    cachedArt,
    dominantColor,
    durationMs,
    isPlaying,
    shuffle,
    repeat,
    volume,
    isExplicit,
    albumItem,
    artistItem,
    currentObjectId,
    currentServiceId,
    currentAccountId,
    artUrlRaw,
  } = np;
  const { isFavourited, toggle: toggleFavourite } = useFavourite(displayName, {
    uri: currentObjectId,
    trackName: displayTrack,
    artist: displayArtist,
    imageUrl: artUrlRaw,
    serviceId: currentServiceId,
    accountId: currentAccountId,
  });
  const queuer = useQueuer({ id: currentObjectId, title: displayTrack, artist: displayArtist });
  const { toggleShuffle, toggleRepeat } = usePlayModeToggles(playback, onShuffle);

  // Opened by a link or a reload there is nothing to go back to: Home, then.
  const close = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) void navigate(-1);
    else void navigate('/', { replace: true });
  };
  const repeatLabel = repeat === 'one' ? 'Repeat one' : repeat === 'all' ? 'Repeat all' : 'Repeat off';

  return (
    <div
      className={`page-scale ${styles.page}`}
      style={dominantColor ? ({ '--wash': dominantColor } as React.CSSProperties) : undefined}
    >
      <header className={styles.top}>
        <button type="button" className={styles.ctrl} onClick={close} aria-label="Close the player">
          <ChevronDown size={24} aria-hidden="true" />
        </button>
        <h1 className={styles.heading}>Now playing</h1>
        <span className={styles.topSpacer} />
      </header>

      <div className={styles.artBox}>
        {cachedArt ? (
          <img className={styles.art} src={cachedArt} alt="" />
        ) : (
          <div className={`${styles.art} ${styles.artPh}`}>
            <Music size={56} aria-hidden="true" />
          </div>
        )}
      </div>

      <div className={styles.meta}>
        <div className={styles.titles}>
          <h2 className={styles.title}>
            {albumItem && displayTrack ? (
              <button
                type="button"
                className={styles.link}
                aria-label={`${displayTrack}, open album`}
                onClick={() => openItem(albumItem)}
              >
                {displayTrack}
              </button>
            ) : (
              displayTrack || 'Nothing playing'
            )}
            {isExplicit && <ExplicitBadge />}
          </h2>
          {displayArtist &&
            (artistItem ? (
              <button
                type="button"
                className={`${styles.link} ${styles.artist}`}
                aria-label={`${displayArtist}, open artist`}
                onClick={() => openItem(artistItem)}
              >
                {displayArtist}
              </button>
            ) : (
              <p className={styles.artist}>{displayArtist}</p>
            ))}
        </div>
        {displayName && currentObjectId && (
          <button
            type="button"
            className={`${styles.ctrl}${isFavourited ? ' ' + styles.favourited : ''}`}
            onClick={() => void toggleFavourite()}
            aria-label={isFavourited ? 'Remove from Favourites' : 'Add to Favourites'}
            aria-pressed={isFavourited}
          >
            <Heart size={22} fill={isFavourited ? 'currentColor' : 'none'} aria-hidden="true" />
          </button>
        )}
      </div>

      {queuer && (
        <QueuerChip
          className={styles.queuer}
          user={queuer.user}
          imageUrl={queuer.imageUrl}
          onOpen={() => void navigate(`/profile/${encodeURIComponent(queuer.user)}`)}
        />
      )}

      <div className={styles.progress}>
        <LiveSeekBar
          durationMs={durationMs}
          className={styles.seek}
          trackClassName={styles.seekTrack}
          fillClassName={styles.seekFill}
        />
        <div className={styles.times}>
          <PlaybackTime part="elapsed" />
          <PlaybackTime part="duration" />
        </div>
      </div>

      <div className={styles.transport}>
        <button
          type="button"
          className={`${styles.ctrl}${shuffle ? ' ' + styles.on : ''}`}
          disabled={!isAuthed}
          onClick={() => void toggleShuffle()}
          aria-label="Shuffle"
          aria-pressed={!!shuffle}
        >
          <Shuffle size={20} aria-hidden="true" />
        </button>
        <TransportButtons
          disabled={!isAuthed}
          isPlaying={isPlaying}
          btnClassName={styles.skip}
          playClassName={styles.play}
          size={28}
          playSize={28}
          pauseSize={26}
          filled
        />
        <button
          type="button"
          className={`${styles.ctrl}${repeat !== 'none' ? ' ' + styles.on : ''}`}
          disabled={!isAuthed}
          onClick={toggleRepeat}
          aria-label={repeatLabel}
        >
          {repeat === 'one' ? <Repeat1 size={20} aria-hidden="true" /> : <Repeat size={20} aria-hidden="true" />}
        </button>
      </div>

      <VolumeRow volume={volume} disabled={!isAuthed} />

      <div className={styles.actions}>
        <PillButton className={styles.action} onClick={() => void navigate('/lyrics')}>
          <MicVocal size={18} aria-hidden="true" /> Lyrics
        </PillButton>
        <PillButton className={styles.action} onClick={() => void navigate('/queue')}>
          <ListMusic size={18} aria-hidden="true" /> Queue
        </PillButton>
      </div>
    </div>
  );
}
