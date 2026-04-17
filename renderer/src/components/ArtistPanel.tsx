import { useState } from "react";
import { useLocation } from "react-router-dom";
import { Radio } from "lucide-react";
import { useImage } from "../hooks/useImage";
import { useArtistBrowse } from "../hooks/useArtistBrowse";
import { useDominantColor } from "../hooks/useDominantColor";
import { useOpenItem } from "../hooks/useOpenItem";
import { resolveArtistParams, fmtDuration } from "../lib/itemHelpers";
import { ExplicitBadge } from "./ExplicitBadge";
import type { AlbumTrack } from "../hooks/useAlbumBrowse";
import type { SonosItem } from "../types/sonos";
import styles from "../styles/ArtistPanel.module.css";

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
  onAddToQueue: (item: SonosItem) => void;
}

export function ArtistPanel({ onAddToQueue }: Props) {
  const { state } = useLocation();
  const item = (state as { item?: SonosItem } | null)?.item;
  const openItem = useOpenItem();

  const {
    artistId,
    serviceId,
    accountId,
    defaults,
    name: fallbackName,
  } = item ? resolveArtistParams(item) : { artistId: undefined, serviceId: undefined, accountId: undefined, defaults: undefined, name: undefined };

  const { data, isLoading } = useArtistBrowse(
    artistId,
    serviceId,
    accountId,
    defaults,
  );

  const name = data?.name ?? fallbackName ?? item?.title ?? item?.name ?? "";
  const imageUrl =
    data?.imageUrl ??
    (item?.images as Record<string, string> | undefined)?.["tile1x1"] ??
    item?.imageUrl ??
    null;

  const [showAllSongs, setShowAllSongs] = useState(false);

  const cachedArt     = useImage(imageUrl);
  const dominantColor = useDominantColor(cachedArt);

  const artistRadio = data?.playlists.find((p) =>
    (p.title as string)?.toLowerCase().includes("radio"),
  );
  const latestAlbum = data?.albums[0] ?? null;

  if (!item) return null;

  return (
    <div className={styles.panel}>
      {/* ── Header ── key on artistId so art/color reset instantly on navigation */}
      <div
        key={artistId}
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
          </div>
        </div>
      </div>

      {/* ── Two-column body ── */}
      <div className={styles.mainGrid}>
        {isLoading ? (
          <>
            {/* Left skeleton */}
            <div className={styles.topSongsCol}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className={styles.skeletonRow} />
              ))}
            </div>
            {/* Right skeleton */}
            <div className={styles.sideCol}>
              <div className={styles.skeletonCard} />
              <div className={styles.skeletonCard} />
            </div>
          </>
        ) : (
          <>
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
                <LatestReleaseCard album={latestAlbum} onOpen={openItem} />
              )}
              {artistRadio && (
                <RadioCard
                  item={artistRadio}
                  artUrl={cachedArt}
                  onOpen={openItem}
                />
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Albums shelf ── */}
      {(data?.albums.length ?? 0) > 1 && (
        <div className={styles.albumsSection}>
          <div className={styles.sectionTitle}>Albums</div>
          <div className={styles.albumsRow}>
            {data!.albums.map((album) => (
              <AlbumCard
                key={(typeof album.id === 'string' ? album.id : album.id?.objectId) ?? album.title}
                album={album}
                onOpen={openItem}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
