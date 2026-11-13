import { useRef } from 'react';
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
import { championLabel, useChampionFor } from '../../lib/champion';
import { useSwipeDismiss } from '../../lib/swipeDismiss';
import { ExplicitBadge } from '../common/ExplicitBadge';
import { UserAvatar } from '../common/UserAvatar';
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

/** The room's volume as one quiet slider: the player bar's popover, laid flat for a thumb. No number: the thumb says it. */
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
    </div>
  );
}

/** The face of whoever queued the track, small, on the artwork's corner. Opens their profile. */
function QueuerFace({ user, imageUrl, onOpen }: { user: string; imageUrl?: string | null; onOpen: () => void }) {
  const champion = useChampionFor(user);
  return (
    <button
      type="button"
      className={styles.queuer}
      onClick={onOpen}
      aria-label={`Queued by ${user}${champion ? `, ${championLabel(champion)}` : ''}, open profile`}
    >
      <UserAvatar name={user} imageUrl={imageUrl} className={styles.face} />
    </button>
  );
}

/**
 * The phone shell's Now playing page (/now-playing): the art, who and what, one progress bar, three transport
 * buttons, a quiet volume slider and one tool bar. The art takes whatever height is left, so the controls never
 * leave the screen. Opened from the mini player; the chevron, Back or a swipe down closes it.
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
    albumName,
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
  const pageRef = useRef<HTMLDivElement>(null);
  useSwipeDismiss(pageRef, close);
  const repeatLabel = repeat === 'one' ? 'Repeat one' : repeat === 'all' ? 'Repeat all' : 'Repeat off';
  const favLabel = isFavourited ? 'Remove from Favourites' : 'Add to Favourites';

  return (
    <div
      ref={pageRef}
      className={`page-scale ${styles.page}`}
      style={dominantColor ? ({ '--wash': dominantColor } as React.CSSProperties) : undefined}
    >
      <header className={styles.top}>
        <button type="button" className={styles.ctrl} onClick={close} aria-label="Close the player">
          <ChevronDown size={24} aria-hidden="true" />
        </button>
        <span className={styles.grab} aria-hidden="true" />
        <h1 className={styles.heading}>Now playing</h1>
        <span className={styles.topSpacer} />
      </header>

      <div className={styles.artBox}>
        <div className={styles.artFrame}>
          {cachedArt ? (
            <img className={styles.art} src={cachedArt} alt="" />
          ) : (
            <div className={`${styles.art} ${styles.artPh}`}>
              <Music size={56} aria-hidden="true" />
            </div>
          )}
          {queuer && (
            <QueuerFace
              user={queuer.user}
              imageUrl={queuer.imageUrl}
              onOpen={() => void navigate(`/profile/${encodeURIComponent(queuer.user)}`)}
            />
          )}
        </div>
      </div>

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
            <span className={styles.plain}>{displayTrack || 'Nothing playing'}</span>
          )}
          {isExplicit && <ExplicitBadge />}
        </h2>
        {(displayArtist || albumName) && (
          <p className={styles.sub}>
            {displayArtist &&
              (artistItem ? (
                <button
                  type="button"
                  className={styles.link}
                  aria-label={`${displayArtist}, open artist`}
                  onClick={() => openItem(artistItem)}
                >
                  {displayArtist}
                </button>
              ) : (
                <span className={styles.plain}>{displayArtist}</span>
              ))}
            {displayArtist && albumName && (
              <span className={styles.dot} aria-hidden="true">
                {' · '}
              </span>
            )}
            {albumName &&
              (albumItem ? (
                <button
                  type="button"
                  className={`${styles.link} ${styles.album}`}
                  aria-label={`${albumName}, open album`}
                  onClick={() => openItem(albumItem)}
                >
                  {albumName}
                </button>
              ) : (
                <span className={styles.plain}>{albumName}</span>
              ))}
          </p>
        )}
      </div>

      <div className={styles.progress}>
        <LiveSeekBar
          durationMs={durationMs}
          className={styles.seek}
          trackClassName={styles.seekTrack}
          fillClassName={styles.seekFill}
          thumbClassName={styles.seekThumb}
        />
        <div className={styles.times}>
          <PlaybackTime part="elapsed" />
          <PlaybackTime part="duration" />
        </div>
      </div>

      <div className={styles.transport}>
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
      </div>

      <VolumeRow volume={volume} disabled={!isAuthed} />

      <div className={styles.tools} role="toolbar" aria-label="More player controls">
        <button
          type="button"
          className={`${styles.tool}${shuffle ? ' ' + styles.on : ''}`}
          disabled={!isAuthed}
          onClick={() => void toggleShuffle()}
          aria-label="Shuffle"
          title="Shuffle"
          aria-pressed={!!shuffle}
        >
          <Shuffle size={20} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`${styles.tool}${repeat !== 'none' ? ' ' + styles.on : ''}`}
          disabled={!isAuthed}
          onClick={toggleRepeat}
          aria-label={repeatLabel}
          title={repeatLabel}
          aria-pressed={repeat !== 'none'}
        >
          {repeat === 'one' ? <Repeat1 size={20} aria-hidden="true" /> : <Repeat size={20} aria-hidden="true" />}
        </button>
        {displayName && currentObjectId && (
          <button
            type="button"
            className={`${styles.tool}${isFavourited ? ' ' + styles.on : ''}`}
            onClick={() => void toggleFavourite()}
            aria-label={favLabel}
            title={favLabel}
            aria-pressed={isFavourited}
          >
            <Heart size={20} fill={isFavourited ? 'currentColor' : 'none'} aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          className={styles.tool}
          onClick={() => void navigate('/lyrics')}
          aria-label="Lyrics"
          title="Lyrics"
        >
          <MicVocal size={20} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={styles.tool}
          onClick={() => void navigate('/queue')}
          aria-label="Queue"
          title="Queue"
        >
          <ListMusic size={20} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
