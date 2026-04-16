import { useState } from "react";
import { Play, Shuffle, Radio } from "lucide-react";
import { useImage } from "../hooks/useImage";
import { useArtistBrowse } from "../hooks/useArtistBrowse";
import { useDominantColor } from "../hooks/useDominantColor";
import { resolveArtistParams, fmtDuration } from "../lib/itemHelpers";
import { ExplicitBadge } from "./ExplicitBadge";
import type { AlbumTrack } from "../hooks/useAlbumBrowse";
import type { SonosItem } from "../types/sonos";
import styles from "../styles/ArtistPanel.module.css";

// ── Social icon SVGs ─────────────────────────────────────────────────────────

function IconX() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.857L1.254 2.25H8.08l4.261 5.636 5.903-5.636Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function IconFacebook() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073C24 5.404 18.627 0 12 0S0 5.404 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.791-4.697 4.533-4.697 1.313 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.269h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
    </svg>
  );
}

function IconInstagram() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
    </svg>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TopSongRow({
  track,
  index,
  onAdd,
}: {
  track: AlbumTrack;
  index: number;
  onAdd: (item: SonosItem) => void;
}) {
  const art = useImage(track.artUrl);
  const subtitle = (track.raw as Record<string, unknown>)?.["subtitle"] as
    | string
    | undefined;
  return (
    <div className={styles.topSongRow}>
      <span className={styles.topSongNum}>{index + 1}</span>
      <div className={styles.topSongArt}>
        {art ? (
          <img src={art} alt="" />
        ) : (
          <div className={styles.topSongArtPh} />
        )}
      </div>
      <div className={styles.topSongInfo}>
        <span className={styles.topSongName}>
          {track.title}
          {track.explicit && <ExplicitBadge />}
        </span>
        {subtitle && <span className={styles.topSongSub}>{subtitle}</span>}
      </div>
      <span className={styles.topSongDur}>
        {fmtDuration(track.durationSeconds)}
      </span>
      <button className={styles.addBtn} onClick={() => onAdd(track.raw)}>
        +
      </button>
    </div>
  );
}

function LatestReleaseCard({
  album,
  onOpen,
}: {
  album: SonosItem;
  onOpen: (item: SonosItem) => void;
}) {
  const rawUrl =
    (album.images as Record<string, string> | undefined)?.["tile1x1"] ?? null;
  const art = useImage(rawUrl);
  const subtitle = (album as Record<string, unknown>)["subtitle"] as
    | string
    | undefined;
  return (
    <div className={styles.latestRelease}>
      <div className={styles.sectionTitle}>Latest Release</div>
      <div className={styles.latestCard} onClick={() => onOpen(album)}>
        <div className={styles.latestArt}>
          {art ? (
            <img src={art} alt="" />
          ) : (
            <div className={styles.latestArtPh}>♪</div>
          )}
        </div>
        <div className={styles.latestMeta}>
          <div className={styles.latestTitle}>{album.title}</div>
          {subtitle && <div className={styles.latestSub}>{subtitle}</div>}
        </div>
      </div>
    </div>
  );
}

function RadioCard({
  item,
  artUrl,
  onOpen,
}: {
  item: SonosItem;
  artUrl: string | null;
  onOpen: (item: SonosItem) => void;
}) {
  const subtitle = (item as Record<string, unknown>)["subtitle"] as
    | string
    | undefined;
  return (
    <div className={styles.latestRelease}>
      <div className={styles.sectionTitle}>Artist Radio</div>
      <div className={styles.latestCard} onClick={() => onOpen(item)}>
        <div className={`${styles.latestArt} ${styles.latestArtRadio}`}>
          {artUrl && (
            <img src={artUrl} alt="" className={styles.latestArtRadioBg} />
          )}
          <div className={styles.latestArtRadioOverlay}>
            <Radio size={36} />
          </div>
        </div>
        <div className={styles.latestMeta}>
          <div className={styles.latestTitle}>{item.title}</div>
          {subtitle && <div className={styles.latestSub}>{subtitle}</div>}
        </div>
      </div>
    </div>
  );
}

function AlbumCard({
  album,
  onOpen,
}: {
  album: SonosItem;
  onOpen: (item: SonosItem) => void;
}) {
  const rawUrl =
    (album.images as Record<string, string> | undefined)?.["tile1x1"] ?? null;
  const art = useImage(rawUrl);
  const raw = album as Record<string, unknown>;
  const subtitle = raw["subtitle"] as string | undefined;
  const explicit = !!raw["isExplicit"];
  return (
    <div className={styles.albumCard} onClick={() => onOpen(album)}>
      <div className={styles.albumArt}>
        {art ? (
          <img src={art} alt="" />
        ) : (
          <div className={styles.albumArtPh}>♪</div>
        )}
      </div>
      <div className={styles.albumTitle}>
        <span className={styles.albumTitleText}>{album.title}</span>
        {explicit && <ExplicitBadge />}
      </div>
      {subtitle && <div className={styles.albumSub}>{subtitle}</div>}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface Props {
  item: SonosItem;
  onOpenAlbum: (item: SonosItem) => void;
  onAddToQueue: (item: SonosItem) => void;
}

export function ArtistPanel({ item, onOpenAlbum, onAddToQueue }: Props) {
  const {
    artistId,
    serviceId,
    accountId,
    defaults,
    name: fallbackName,
  } = resolveArtistParams(item);
  const { data, isLoading } = useArtistBrowse(
    artistId,
    serviceId,
    accountId,
    defaults,
  );

  const name = data?.name ?? fallbackName ?? item.title ?? item.name ?? "";
  const imageUrl =
    data?.imageUrl ??
    (item.images as Record<string, string> | undefined)?.["tile1x1"] ??
    item.imageUrl ??
    null;

  const [showAllSongs, setShowAllSongs] = useState(false);

  const cachedArt = useImage(imageUrl);
  const dominantColor = useDominantColor(cachedArt);

  const artistShuffle = data?.playlists.find((p) =>
    (p.title as string)?.toLowerCase().includes("shuffle"),
  );
  const artistRadio = data?.playlists.find((p) =>
    (p.title as string)?.toLowerCase().includes("radio"),
  );
  const latestAlbum = data?.albums[0] ?? null;

  return (
    <div className={styles.panel}>
      {/* ── Header ── */}
      <div
        className={styles.header}
        style={
          dominantColor
            ? {
                background: `linear-gradient(180deg, rgba(${dominantColor},0.55) 0%, rgba(${dominantColor},0.2) 60%, transparent 100%)`,
                transition: "background 0.8s ease",
              }
            : undefined
        }
      >
        {/* Row: circle (hangs below via margin-bottom) + name, centred together */}
        <div className={styles.headerRow}>
          <div className={styles.headerArtWrap}>
            {cachedArt ? (
              <img className={styles.headerArt} src={cachedArt} alt="" />
            ) : (
              <div className={styles.headerArtPh} />
            )}
          </div>
          <div className={styles.headerInfo}>
            <div className={styles.artistName}>{name}</div>
            <p className={styles.artistBlurb}>
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do
              eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim
              ad minim veniam, quis nostrud exercitation ullamco laboris.
            </p>
          </div>
          <div className={styles.headerSocial}>
            <a className={styles.socialLink} href="#" title="X / Twitter"><IconX /></a>
            <a className={styles.socialLink} href="#" title="Facebook"><IconFacebook /></a>
            <a className={styles.socialLink} href="#" title="Instagram"><IconInstagram /></a>
          </div>
        </div>
      </div>

      {/* ── Two-column body ── */}
      {!isLoading && (
        <div className={styles.mainGrid}>
          {/* Left – Top Songs */}
          <div className={styles.topSongsCol}>
            {(data?.topSongs.length ?? 0) > 0 && (
              <>
                <button
                  className={styles.sectionTitleBtn}
                  onClick={() => setShowAllSongs((s) => !s)}
                >
                  Top Songs{" "}
                  <span className={styles.sectionChevron}>
                    {showAllSongs ? "∨" : "›"}
                  </span>
                </button>
                {(showAllSongs
                  ? data!.topSongs
                  : data!.topSongs.slice(0, 10)
                ).map((track, i) => (
                  <TopSongRow
                    key={track.id.objectId ?? i}
                    track={track}
                    index={i}
                    onAdd={onAddToQueue}
                  />
                ))}
              </>
            )}
          </div>

          {/* Right – Latest Release + Artist Radio */}
          <div className={styles.sideCol}>
            {latestAlbum && (
              <LatestReleaseCard album={latestAlbum} onOpen={onOpenAlbum} />
            )}
            {artistRadio && (
              <RadioCard
                item={artistRadio}
                artUrl={cachedArt}
                onOpen={onOpenAlbum}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Albums shelf ── */}
      {(data?.albums.length ?? 0) > 1 && (
        <div className={styles.albumsSection}>
          <div className={styles.sectionTitle}>Albums</div>
          <div className={styles.albumsRow}>
            {data!.albums.map((album) => (
              <AlbumCard
                key={album.id?.objectId ?? album.title}
                album={album}
                onOpen={onOpenAlbum}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
