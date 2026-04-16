import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/sonosApi";
import {
  extractItems,
  parseServiceSearch,
  getName,
  browseSub,
  getArt,
  resolveAlbumParams,
  resolveArtistParams,
  fmtDuration,
} from "../lib/itemHelpers";
import type { ServiceSearch } from "../types/ServiceSearch";
import { albumQueryOptions } from "../hooks/useAlbumBrowse";
import { artistQueryOptions } from "../hooks/useArtistBrowse";
import { useImage } from "../hooks/useImage";
import { useDominantColor } from "../hooks/useDominantColor";
import { ExplicitBadge } from "./ExplicitBadge";
import type { SonosItem } from "../types/sonos";
import { TrackCard } from "./TrackCard";
import { ItemRow } from "./ItemRow";
import styles from "../styles/HomePanel.module.css";

interface Props {
  isAuthed: boolean;
  view: "home" | "search";
  activeSearch: string;
  onAddToQueue: (item: SonosItem) => void;
  onOpenAlbum: (item: SonosItem) => void;
  onOpenArtist: (item: SonosItem) => void;
}

// ── Type guards ───────────────────────────────────────────────────────────────

function isAlbum(item: SonosItem): boolean {
  const type = (item.resource?.type ?? item.type ?? "") as string;
  return type.toUpperCase().includes("ALBUM");
}

function isArtist(item: SonosItem): boolean {
  const type = (item.resource?.type ?? item.type ?? "") as string;
  return type.toUpperCase().includes("ARTIST");
}

function isTrack(item: SonosItem): boolean {
  const type = (item.resource?.type ?? item.type ?? "") as string;
  return type.toUpperCase().includes("TRACK");
}

function getItemArt(item: SonosItem): string | null {
  return (
    (item.images as Record<string, string> | undefined)?.["tile1x1"] ??
    getArt(item) ??
    null
  );
}

// ── Home page card row ────────────────────────────────────────────────────────

function CardRow({
  items,
  isLoading,
  onAdd,
  onOpen,
}: {
  items: SonosItem[];
  isLoading: boolean;
  onAdd: (item: SonosItem) => void;
  onOpen: (item: SonosItem) => void;
}) {
  if (isLoading) {
    return (
      <div className={styles.cardRow}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={styles.placeholder} />
        ))}
      </div>
    );
  }
  if (!items.length) return null;
  return (
    <div className={styles.cardRow}>
      {items.map((item, i) => (
        <TrackCard
          key={i}
          name={getName(item)}
          sub={browseSub(item)}
          artUrl={getArt(item)}
          onAdd={() => onAdd(item)}
          onOpen={isAlbum(item) ? () => onOpen(item) : undefined}
        />
      ))}
    </div>
  );
}

// ── Artist hero ───────────────────────────────────────────────────────────────

function HeroTrackRow({
  track,
  index,
  onAdd,
}: {
  track: {
    title: string;
    durationSeconds: number;
    artUrl: string | null;
    explicit: boolean;
    raw: SonosItem;
  };
  index: number;
  onAdd: () => void;
}) {
  const art = useImage(track.artUrl);
  return (
    <div className={styles.heroTrackRow}>
      <span className={styles.heroTrackNum}>{index + 1}</span>
      <div className={styles.heroTrackArt}>
        {art ? (
          <img src={art} alt="" />
        ) : (
          <div className={styles.heroTrackArtPh} />
        )}
      </div>
      <div className={styles.heroTrackInfo}>
        <span className={styles.heroTrackName}>
          {track.title}
          {track.explicit && (
            <span className={styles.heroTrackExplicit}>
              <ExplicitBadge />
            </span>
          )}
        </span>
      </div>
      <span className={styles.heroTrackDur}>
        {fmtDuration(track.durationSeconds)}
      </span>
      <button
        className={styles.heroTrackAdd}
        onClick={(e) => {
          e.stopPropagation();
          onAdd();
        }}
      >
        +
      </button>
    </div>
  );
}

function ArtistHero({
  artist,
  onAddToQueue,
  onOpen,
}: {
  artist: SonosItem;
  onAddToQueue: (item: SonosItem) => void;
  onOpen: (item: SonosItem) => void;
}) {
  const { artistId, serviceId, accountId, defaults } =
    resolveArtistParams(artist);
  const { data } = useQuery({
    ...artistQueryOptions(artistId, serviceId, accountId, defaults),
    enabled: !!(artistId && serviceId && accountId),
  });

  const imageUrl = getItemArt(artist);
  const cachedArt = useImage(imageUrl);
  const dominantColor = useDominantColor(cachedArt);
  const name = (artist.title ?? artist.name ?? "") as string;

  return (
    <div
      className={styles.artistHero}
      style={
        dominantColor
          ? {
              background: `linear-gradient(135deg, rgba(${dominantColor},0.18) 0%, transparent 70%)`,
            }
          : undefined
      }
    >
      <div className={styles.heroLeft}>
        <div className={styles.heroAvatar}>
          {cachedArt ? (
            <img src={cachedArt} alt="" className={styles.heroAvatarImg} />
          ) : (
            <div className={styles.heroAvatarPh} />
          )}
        </div>
        <div className={styles.heroMeta}>
          <div className={styles.heroLabel}>Artist</div>
          <div className={styles.heroName}>{name}</div>
          <button className={styles.heroOpenBtn} onClick={() => onOpen(artist)}>
            Open Artist
          </button>
        </div>
      </div>

      <div className={styles.heroTracks}>
        {data?.topSongs && data.topSongs.length > 0
          ? data.topSongs
              .slice(0, 6)
              .map((track, i) => (
                <HeroTrackRow
                  key={track.id?.objectId ?? i}
                  track={track}
                  index={i}
                  onAdd={() => onAddToQueue(track.raw)}
                />
              ))
          : Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={styles.heroTrackPh} />
            ))}
      </div>
    </div>
  );
}

// ── Artists row ───────────────────────────────────────────────────────────────

function ArtistCircle({
  artist,
  onOpen,
}: {
  artist: SonosItem;
  onOpen: (item: SonosItem) => void;
}) {
  const art = useImage(getItemArt(artist));
  const name = (artist.title ?? artist.name ?? "") as string;
  return (
    <div className={styles.artistCircle} onClick={() => onOpen(artist)}>
      <div className={styles.artistCircleArt}>
        {art ? (
          <img src={art} alt="" />
        ) : (
          <div className={styles.artistCircleArtPh}>{name[0]}</div>
        )}
      </div>
      <div className={styles.artistCircleName}>{name}</div>
    </div>
  );
}

// ── Albums row ────────────────────────────────────────────────────────────────

function SearchAlbumCard({
  album,
  onOpen,
}: {
  album: SonosItem;
  onOpen: (item: SonosItem) => void;
}) {
  const art = useImage(getItemArt(album));
  const name = (album.title ?? album.name ?? "") as string;
  const sub = browseSub(album);
  return (
    <div className={styles.searchAlbumCard} onClick={() => onOpen(album)}>
      <div className={styles.searchAlbumArt}>
        {art ? (
          <img src={art} alt="" />
        ) : (
          <div className={styles.searchAlbumArtPh}>♪</div>
        )}
      </div>
      <div className={styles.searchAlbumTitle}>{name}</div>
      {sub && <div className={styles.searchAlbumSub}>{sub}</div>}
    </div>
  );
}

// ── Search results layout ─────────────────────────────────────────────────────

function SearchResults({
  results,
  onAddToQueue,
  onOpenAlbum,
  onOpenArtist,
}: {
  results: SonosItem[];
  onAddToQueue: (item: SonosItem) => void;
  onOpenAlbum: (item: SonosItem) => void;
  onOpenArtist: (item: SonosItem) => void;
}) {
  const topArtist =
    results.length > 0 && isArtist(results[0]) ? results[0] : null;
  const artists = results.filter(isArtist);
  const albums = results.filter(isAlbum);
  const tracks = results.filter(isTrack);
  const others = results.filter(
    (r) => !isArtist(r) && !isAlbum(r) && !isTrack(r),
  );

  if (results.length === 0)
    return <div className={styles.msg}>No results.</div>;

  return (
    <>
      {topArtist && (
        <ArtistHero
          artist={topArtist}
          onAddToQueue={onAddToQueue}
          onOpen={onOpenArtist}
        />
      )}

      {artists.length > 0 && (
        <section className={styles.searchSection}>
          <h2 className={styles.searchSectionTitle}>Artists</h2>
          <div className={styles.artistsRow}>
            {artists.map((a, i) => (
              <ArtistCircle key={i} artist={a} onOpen={onOpenArtist} />
            ))}
          </div>
        </section>
      )}

      {albums.length > 0 && (
        <section className={styles.searchSection}>
          <h2 className={styles.searchSectionTitle}>Albums</h2>
          <div className={styles.searchAlbumsRow}>
            {albums.map((a, i) => (
              <SearchAlbumCard key={i} album={a} onOpen={onOpenAlbum} />
            ))}
          </div>
        </section>
      )}

      {tracks.length > 0 && (
        <section className={styles.searchSection}>
          <h2 className={styles.searchSectionTitle}>Songs</h2>
          <div className={styles.tracksList}>
            {tracks.map((item, i) => (
              <ItemRow
                key={i}
                name={getName(item)}
                sub={browseSub(item)}
                artUrl={getItemArt(item)}
                showAddButton
                onAdd={() => onAddToQueue(item)}
              />
            ))}
          </div>
        </section>
      )}

      {others.length > 0 && !topArtist && (
        <section className={styles.searchSection}>
          <h2 className={styles.searchSectionTitle}>Other</h2>
          <div className={styles.tracksList}>
            {others.map((item, i) => (
              <ItemRow
                key={i}
                name={getName(item)}
                sub={browseSub(item)}
                artUrl={getItemArt(item)}
                showAddButton
                onAdd={() => onAddToQueue(item)}
                onOpen={
                  isAlbum(item)
                    ? () => onOpenAlbum(item)
                    : isArtist(item)
                      ? () => onOpenArtist(item)
                      : undefined
                }
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function HomePanel({
  isAuthed,
  view,
  activeSearch,
  onAddToQueue,
  onOpenAlbum,
  onOpenArtist,
}: Props) {
  const { data: favorites = [], isLoading: favLoading } = useQuery({
    queryKey: ["favorites"],
    queryFn: async () => {
      const r = await api.content.favorites({ count: 20 });
      return r.error ? [] : extractItems(r.data);
    },
    enabled: isAuthed,
    staleTime: 5 * 60 * 1000,
  });

  const { data: history = [], isLoading: histLoading } = useQuery({
    queryKey: ["history"],
    queryFn: async () => {
      const r = await api.content.history({ count: 20 });
      return r.error ? [] : extractItems(r.data);
    },
    enabled: isAuthed,
    staleTime: 60 * 1000,
  });

  const { data: searchResults = [], isFetching: searchLoading } = useQuery({
    queryKey: ["search", activeSearch],
    queryFn: async () => {
      const r = await api.search.serviceQuery(activeSearch, { count: 50 });
      return r.error ? [] : parseServiceSearch(r.data as ServiceSearch);
    },
    enabled: view === "search" && !!activeSearch,
    staleTime: 2 * 60 * 1000,
  });

  const queryClient = useQueryClient();

  useEffect(() => {
    if (view !== "search" || !searchResults.length) return;

    // Prefetch first 3 albums
    searchResults
      .filter(isAlbum)
      .slice(0, 3)
      .forEach((item) => {
        const { albumId, serviceId, accountId, defaults } =
          resolveAlbumParams(item);
        if (albumId && serviceId && accountId) {
          queryClient.prefetchQuery(
            albumQueryOptions(albumId, serviceId, accountId, defaults),
          );
        }
      });

    // Prefetch top artist
    const top = searchResults[0];
    if (top && isArtist(top)) {
      const { artistId, serviceId, accountId, defaults } =
        resolveArtistParams(top);
      if (artistId && serviceId && accountId) {
        queryClient.prefetchQuery(
          artistQueryOptions(artistId, serviceId, accountId, defaults),
        );
      }
    }
  }, [searchResults, view, queryClient]);

  if (view === "search") {
    return (
      <div className={styles.panel}>
        {searchLoading ? (
          <div className={styles.msg}>Searching…</div>
        ) : (
          <SearchResults
            results={searchResults}
            onAddToQueue={onAddToQueue}
            onOpenAlbum={onOpenAlbum}
            onOpenArtist={onOpenArtist}
          />
        )}
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      {!isAuthed ? (
        <div className={styles.msg}>Waiting for authentication…</div>
      ) : (
        <>
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Favorites</h2>
            </div>
            <CardRow
              items={favorites}
              isLoading={favLoading}
              onAdd={onAddToQueue}
              onOpen={onOpenAlbum}
            />
          </section>
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Recently Played</h2>
            </div>
            <CardRow
              items={history}
              isLoading={histLoading}
              onAdd={onAddToQueue}
              onOpen={onOpenAlbum}
            />
          </section>
        </>
      )}
    </div>
  );
}
