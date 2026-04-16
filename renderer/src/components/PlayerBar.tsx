import { useEffect, useRef, useState } from "react";
import { useNowPlaying } from "../hooks/useNowPlaying";
import { ExplicitBadge } from "./ExplicitBadge";
import type React from "react";
import {
  Shuffle,
  SkipBack,
  Play,
  Pause,
  SkipForward,
  Repeat,
  Repeat1,
  Volume,
  Volume1,
  Volume2,
  VolumeX,
  List,
  Music,
} from "lucide-react";
import type { PlaybackState } from "../hooks/usePlayback";
import { api } from "../lib/sonosApi";
import type { SonosItem } from "../types/sonos";
import styles from "../styles/PlayerBar.module.css";

interface Props {
  isAuthed: boolean;
  playback: PlaybackState;
  onOpenAlbum: (item: SonosItem) => void;
  onToggleQueue: () => void;
  onShuffle: () => void;
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
      window.sonos.setGroupVolume(val);
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

export function PlayerBar({
  isAuthed,
  playback,
  onOpenAlbum,
  onToggleQueue,
  onShuffle,
}: Props) {
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
    api.playback.seek(Math.floor(pct * durationMs)).then(refresh);
  };

  const refresh = () => window.sonos.refreshPlayback();

  const toggleShuffle = () =>
    window.sonos.setPlayModes({ shuffle: !rawShuffle }).then(refresh).then(onShuffle);

  const toggleRepeat = () => {
    const next = rawRepeat === "none" ? "all" : rawRepeat === "all" ? "one" : "none";
    window.sonos.setPlayModes({ repeat: next === "all", repeatOne: next === "one" }).then(refresh);
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
                onClick={() => albumItem && onOpenAlbum(albumItem)}
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
            onClick={() => window.sonos.skipPrev().then(refresh)}
            title="Previous"
          >
            <SkipBack size={14} />
          </button>
          <button
            className={`${styles.ctrl} ${styles.playBtn}`}
            disabled={!isAuthed}
            onClick={() =>
              (isPlaying ? window.sonos.pause() : window.sonos.play()).then(refresh)
            }
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button
            className={styles.ctrl}
            disabled={!isAuthed}
            onClick={() => window.sonos.skipNext().then(refresh)}
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

        {/* Right — volume + queue */}
        <div className={styles.right}>
          <VolumeButton volume={volume} />
          <button className={styles.ctrl} onClick={onToggleQueue} title="Queue">
            <List size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
