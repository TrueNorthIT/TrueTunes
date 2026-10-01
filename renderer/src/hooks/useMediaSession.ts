import { useEffect, useRef } from "react";
import { getActiveProvider } from "../providers";
import { useTrackDetails } from "./useTrackDetails";
import type { PlaybackState } from "./usePlayback";

/**
 * Publishes the current track to the OS media overlay (Windows System Media
 * Transport Controls, macOS Touch Bar / Control Centre "Now Playing", etc.)
 * via the browser's Media Session API.
 *
 * Chromium only forwards a page's Media Session to the OS while it is
 * tracking a genuinely *playing* `<audio>`/`<video>` element — a bare
 * AudioContext graph (even one making sound) is invisible to it. Sonos
 * playback happens on the speakers, not in this window, so there's nothing
 * for Chromium to track by default. We work around this by synthesising a
 * near-silent tone with the Web Audio API and routing it into a hidden
 * `<audio>` element via `MediaStreamAudioDestinationNode`, giving Chromium a
 * real playing element to hang the Media Session off without being audible.
 */
export function useMediaSession(playback: PlaybackState) {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  // The raw playback push often lacks artwork/full metadata (Sonos only sends a
  // low-res tile1x1 image, sometimes none) — resolve the same richer track
  // details PlayerBar's useNowPlaying uses, so the OS overlay gets proper art.
  const { data: td } = useTrackDetails(
    playback.currentObjectId ?? undefined,
    playback.currentServiceId ?? undefined,
    playback.currentAccountId ?? undefined,
  );
  const trackName = td?.trackName ?? playback.trackName;
  const artistName = td?.artist ?? playback.artistName;
  const albumName = td?.albumName ?? playback.currentAlbumName;
  const artUrl = td?.artUrl ?? playback.artUrl ?? undefined;

  const ensureSilentLoop = () => {
    if (audioCtxRef.current) return audioElRef.current;
    if (typeof window === "undefined" || !("AudioContext" in window)) return null;
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.0001; // near-inaudible, but non-zero so Chromium treats the stream as real audio
    const dest = ctx.createMediaStreamDestination();
    oscillator.connect(gain).connect(dest);
    oscillator.start();

    const audio = new Audio();
    audio.srcObject = dest.stream;
    audio.volume = 0.01;
    // Hidden/detached — only exists to give Chromium a real <audio> element to
    // attach the Media Session to; it's never added to the DOM.
    audioCtxRef.current = ctx;
    audioElRef.current = audio;
    return audio;
  };

  // Keep the silent session alive/suspended in step with whether anything is "now playing".
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    if (playback.isVisible) {
      const audio = ensureSilentLoop();
      audioCtxRef.current?.resume().catch(() => {});
      audio?.play().catch(() => {});
    } else {
      audioElRef.current?.pause();
      audioCtxRef.current?.suspend().catch(() => {});
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = "none";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback.isVisible]);

  // Metadata — title/artist/album/artwork
  useEffect(() => {
    if (!playback.isVisible) return;
    // Push to the native Windows SMTC bridge (src/smtc.ts) — this is what
    // actually registers with GlobalSystemMediaTransportControlsSessionManager;
    // the navigator.mediaSession calls below only cover in-browser/Chromium
    // behavior and cannot reach the OS on their own (Electron limitation).
    window.sonos?.updateNowPlayingSmtc?.({
      title: trackName || "True Tunes",
      artist: artistName || undefined,
      album: albumName || undefined,
      artworkUrl: artUrl || undefined,
    }).catch(() => {});

    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: trackName || "True Tunes",
      artist: artistName || undefined,
      album: albumName || undefined,
      artwork: artUrl ? [{ src: artUrl }] : [],
    });
  }, [playback.isVisible, trackName, artistName, albumName, artUrl]);

  // Playback state — drives the play/pause glyph in the OS overlay
  useEffect(() => {
    if (!("mediaSession" in navigator) || !playback.isVisible) return;
    navigator.mediaSession.playbackState = playback.isPlaying ? "playing" : "paused";
  }, [playback.isVisible, playback.isPlaying]);

  // Position/duration — drives the scrub bar in the OS overlay
  useEffect(() => {
    if (!("mediaSession" in navigator) || !playback.isVisible) return;
    if (!playback.durationMs || playback.durationMs <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: playback.durationMs / 1000,
        playbackRate: playback.isPlaying ? 1 : 0,
        position: Math.min(playback.positionMs, playback.durationMs) / 1000,
      });
    } catch {
      // Some OS/browser combinations reject transient states (e.g. mid-seek) — safe to ignore.
    }
    // Re-sync on track change / play-pause toggle / manual seek, not on every progress tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback.isVisible, playback.currentObjectId, playback.isPlaying, playback.durationMs]);

  // Transport action handlers — wired once, always delegate to the active provider
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    const provider = () => getActiveProvider();
    navigator.mediaSession.setActionHandler("play", () => { provider().play().catch(() => {}); });
    navigator.mediaSession.setActionHandler("pause", () => { provider().pause().catch(() => {}); });
    navigator.mediaSession.setActionHandler("previoustrack", () => { provider().skipPrev().catch(() => {}); });
    navigator.mediaSession.setActionHandler("nexttrack", () => { provider().skipNext().catch(() => {}); });
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime == null) return;
      provider().seek(Math.floor(details.seekTime * 1000)).catch(() => {});
    });

    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
      navigator.mediaSession.setActionHandler("seekto", null);
    };
  }, []);

  // Tear down the silent loop entirely on unmount
  useEffect(() => {
    return () => {
      audioElRef.current?.pause();
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);
}
