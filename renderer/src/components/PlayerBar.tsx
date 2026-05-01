import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { getActiveProvider } from "../providers";
import { useNowPlaying } from "../hooks/useNowPlaying";
import { useOpenItem } from "../hooks/useOpenItem";
import { ExplicitBadge } from "./common/ExplicitBadge";
import type React from "react";
import {
  Shuffle,
  SkipBack,
  Play,
  SkipForward,
  Repeat,
  Repeat1,
  Volume,
  Volume1,
  Volume2,
  VolumeX,
  List,
  Music,
  PictureInPicture2,
  MicVocal,
} from "lucide-react";
import type { PlaybackState } from "../hooks/usePlayback";
import styles from "../styles/PlayerBar.module.css";

interface Props {
  isAuthed: boolean;
  playback: PlaybackState;
  onToggleQueue: () => void;
  onShuffle: () => void;
  queueMode?: 'floating' | 'docked';
}

function ScrollingText({
  text,
  className,
}: {
  text: string;
  className: string;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [dist, setDist] = useState(0);

  useEffect(() => {
    const measure = () => {
      if (!outerRef.current) return;
      const d = outerRef.current.scrollWidth - outerRef.current.clientWidth;
      setDist(d > 2 ? d : 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (outerRef.current) ro.observe(outerRef.current);
    return () => ro.disconnect();
  }, [text]);

  return (
    <div ref={outerRef} className={className}>
      <span
        className={dist > 0 ? styles.scrolling : undefined}
        style={
          dist > 0
            ? ({
                "--tt-dist": `-${dist}px`,
                "--tt-dur": `${(dist / 20 + 4).toFixed(1)}s`,
              } as React.CSSProperties)
            : undefined
        }
      >
        {text}
      </span>
    </div>
  );
}

function VolumeIconGlyph({ volume }: { volume: number }) {
  if (volume === 0) return <VolumeX size={14} />;
  if (volume < 33) return <Volume size={14} />;
  if (volume < 66) return <Volume1 size={14} />;
  return <Volume2 size={14} />;
}

function VolumeButton({ volume }: { volume: number }) {
  const [open, setOpen] = useState(false);
  const [localVol, setLocalVol] = useState(volume);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Sync incoming WS volume only when the user isn't actively dragging
  const dragging = useRef(false);
  useEffect(() => {
    if (!dragging.current) setLocalVol(volume);
  }, [volume]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setLocalVol(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      getActiveProvider().setVolume(val);
      dragging.current = false;
    }, 150);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={wrapRef} className={styles.volWrap}>
      {open && (
        <div className={styles.volPopover}>
          <span className={styles.volPct}>{localVol}</span>
          <input
            className={styles.volSliderV}
            type="range"
            min={0}
            max={100}
            value={localVol}
            onMouseDown={() => {
              dragging.current = true;
            }}
            onChange={handleChange}
          />
        </div>
      )}
      <button
        className={styles.ctrl}
        onClick={() => setOpen((o) => !o)}
        title="Volume"
      >
        <VolumeIconGlyph volume={localVol} />
      </button>
    </div>
  );
}

export function PlayerBar({ isAuthed, playback, onToggleQueue, onShuffle, queueMode }: Props) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const lyricsActive = pathname === '/lyrics';
  const openItem = useOpenItem();
  const {
    displayTrack, displayArtist, cachedArt, dominantColor,
    elapsedLabel, durationLabel, progressPct, durationMs,
    isPlaying, isVisible, shuffle, repeat, volume, isExplicit,
    albumItem, prefetchAlbum,
  } = useNowPlaying(playback);

  const { shuffle: rawShuffle, repeat: rawRepeat } = playback;

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!durationMs) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    getActiveProvider().seek(Math.floor(pct * durationMs)).then(refresh);
  };

  const refresh = () => getActiveProvider().refreshPlayback();

  const toggleShuffle = () =>
    getActiveProvider().setPlayModes({ shuffle: !rawShuffle }).then(refresh).then(onShuffle);

  const toggleRepeat = () => {
    const next = rawRepeat === "none" ? "all" : rawRepeat === "all" ? "one" : "none";
    getActiveProvider().setPlayModes({ repeat: next as 'none' | 'one' | 'all' }).then(refresh);
  };

  if (!isVisible)
    return <div style={{ height: "var(--player-h)", flexShrink: 0 }} />;

  return (
    <div
      className={styles.bar}
      style={
        dominantColor
          ? {
              background: `linear-gradient(105deg, rgba(${dominantColor}, 0.18) 0%, rgba(255,255,255,0.03) 60%)`,
              boxShadow: `0 12px 48px rgba(0,0,0,0.4), 0 0 50px rgba(${dominantColor}, 0.12), 0 1px 0 rgba(255,255,255,0.08) inset, 0 -1px 0 rgba(0,0,0,0.2) inset`,
            }
          : undefined
      }
    >
      <div className={styles.inner}>
        {/* Left — art + track info */}
        <div className={styles.left}>
          <div className={styles.artWrap}>
            {cachedArt ? (
              <img
                className={styles.art}
                src={cachedArt}
                alt=""
                style={!albumItem ? { cursor: "default" } : undefined}
                onMouseEnter={prefetchAlbum}
                onClick={() => albumItem && openItem(albumItem)}
              />
            ) : (
              <div className={styles.artPh}>
                <Music size={16} />
              </div>
            )}
          </div>
          <div className={styles.trackInfo}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                overflow: "hidden",
              }}
            >
              <ScrollingText
                text={`${displayTrack || "—"}${displayArtist ? ` - ${displayArtist}` : ""}`}
                className={styles.trackName}
              />
              {isExplicit && <ExplicitBadge />}
            </div>
            <div className={styles.progressSection}>
              <span className={styles.time}>{elapsedLabel}</span>
              <div
                className={styles.progressBar}
                onClick={handleSeek}
                role="progressbar"
                aria-valuenow={progressPct}
              >
                <div
                  className={styles.progressFill}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className={styles.time}>{durationLabel}</span>
            </div>
          </div>
        </div>

        {/* Centre — transport */}
        <div className={styles.transport}>
          <button
            className={`${styles.ctrl}${shuffle ? " " + styles.active : ""}`}
            disabled={!isAuthed}
            onClick={toggleShuffle}
            title="Shuffle"
          >
            <Shuffle size={11} />
          </button>
          <button
            className={styles.ctrl}
            disabled={!isAuthed}
            onClick={() => getActiveProvider().skipPrev().then(refresh)}
            title="Previous"
          >
            <SkipBack size={14} />
          </button>
          <button
            className={`${styles.ctrl} ${styles.playBtn}`}
            disabled={!isAuthed}
            onClick={() =>
              (isPlaying ? getActiveProvider().pause() : getActiveProvider().play()).then(refresh)
            }
          >
            {isPlaying ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
                <rect x="2" y="1" width="4" height="12" rx="1" />
                <rect x="8" y="1" width="4" height="12" rx="1" />
              </svg>
            ) : <Play size={14} />}
          </button>
          <button
            className={styles.ctrl}
            disabled={!isAuthed}
            onClick={() => getActiveProvider().skipNext().then(refresh)}
            title="Next"
          >
            <SkipForward size={14} />
          </button>
          <button
            className={`${styles.ctrl}${repeat !== "none" ? " " + styles.active : ""}`}
            disabled={!isAuthed}
            onClick={toggleRepeat}
            title={
              repeat === "one"
                ? "Repeat one"
                : repeat === "all"
                  ? "Repeat all"
                  : "Repeat off"
            }
          >
            {repeat === "one" ? <Repeat1 size={11} /> : <Repeat size={11} />}
          </button>
        </div>

        {/* Right — volume + lyrics + queue + mini player */}
        <div className={styles.right}>
          <VolumeButton volume={volume} />
          <button
            className={`${styles.ctrl}${lyricsActive ? " " + styles.active : ""}`}
            onClick={() => lyricsActive ? navigate(-1) : navigate('/lyrics')}
            title="Lyrics"
          >
            <MicVocal size={14} />
          </button>
          <button className={styles.ctrl} onClick={onToggleQueue} title={queueMode === 'docked' ? 'Jump to now playing' : 'Queue'}>
            <List size={14} />
          </button>
          <button
            className={styles.ctrl}
            onClick={() => window.sonos.openMiniPlayer()}
            title="Mini player"
          >
            <PictureInPicture2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
