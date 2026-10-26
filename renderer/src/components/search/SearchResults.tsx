import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Radio } from 'lucide-react';
import { useOpenItem } from '../../hooks/useOpenItem';
import { useResolveAndOpen } from '../../hooks/useResolveAndOpen';
import { useStats } from '../../hooks/useStats';
import { albumQueryOptions } from '../../hooks/useAlbumBrowse';
import { artistQueryOptions } from '../../hooks/useArtistBrowse';
import {
  canQueueWhole,
  fmtTime,
  getItemArt,
  getName,
  isAlbum,
  isArtist,
  isPlaylist,
  isProgram,
  isTrack,
  resolveAlbumParams,
  resolveArtistParams,
  albumItem,
  artistItem,
  trackPayload,
} from '../../lib/itemHelpers';
import {
  albumNameOf,
  albumSub,
  pickTopResult,
  playlistSub,
  searchTrackRow,
  topSongRow,
  withTopSongs,
  type SongRow,
} from '../../lib/searchResults';
import { officeCountFor } from '../../lib/artistOffice';
import { withArtworkSize } from '../../lib/artworkUrl';
import { createDragGhost } from '../../lib/dragHelpers';
import { useTrackContextMenu } from '../common/ContextMenu';
import { Carousel } from '../common/Carousel';
import { ImageTile } from '../common/ImageTile';
import { OfficeChip } from '../common/OfficeChip';
import { PillButton } from '../common/PillButton';
import { SectionCard, SeeAll } from '../common/SectionCard';
import { TopResultCard } from '../common/TopResultCard';
import { TrackRow } from '../common/TrackRow';
import { ArtistLinks } from '../common/TrackLinks';
import type { SonosItem, SonosAlbum } from '../../types/sonos';
import styles from './SearchResults.module.css';
import { useQueueActions } from '../../hooks/useQueueActions';

const SONGS_SHOWN = 5;

const objectIdOf = (item: SonosItem): string | undefined =>
  (typeof item.id === 'object' ? item.id.objectId : undefined) ?? item.resource?.id?.objectId;

const artistNamesOf = (item: SonosItem): string => (item.artists ?? []).map((a) => a.name).join(', ');

/** The album page item for a search track, when the service gave the album's id. */
function albumItemOf(track: SonosItem): SonosItem | null {
  const a = track.album as SonosAlbum | undefined;
  if (typeof a !== 'object' || !a?.id?.objectId) return null;
  return albumItem(a.name, a.id);
}

function buildTrackPayload(r: SongRow): PlaylistTrack {
  return trackPayload({
    uri: r.id.objectId ?? '',
    trackName: r.title,
    artist: r.artists[0]?.name ?? '',
    albumName: r.album?.name,
    imageUrl: r.imageUrl,
    serviceId: r.id.serviceId,
    accountId: r.id.accountId,
  });
}

/** The album page item for a row, when its album's id is known. */
function rowAlbumItem(r: SongRow): SonosItem | null {
  return r.album?.id?.objectId ? albumItem(r.album.name, r.album.id) : null;
}

interface Props {
  /** The query these results are for (not the one being typed). */
  query: string;
  results: SonosItem[];
  /** Any click in the results: the query found something worth remembering. */
  onEngage?: () => void;
}

/**
 * Search results for finding music you already know: the likeliest hit beside the songs (with album and length, so
 * the right version is obvious), then the service's other sections in its own order, then videos and uploads, folded.
 */
export function SearchResults({ query, results, onEngage }: Props) {
  const { addToQueue: onAddToQueue } = useQueueActions();
  const openItem = useOpenItem();
  const { resolveAndOpen } = useResolveAndOpen();
  const queryClient = useQueryClient();
  const { showTrackMenu } = useTrackContextMenu();
  const { data: stats } = useStats('alltime', undefined, 100);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const lastSelected = useRef<number | null>(null);
  const [songsOpen, setSongsOpen] = useState(false);
  const [videosOpen, setVideosOpen] = useState(false);

  const top = pickTopResult(results, query);
  const notTop = (i: SonosItem) => i !== top;
  const tracks = results.filter(isTrack);
  const searchSongs = tracks.filter((t) => albumNameOf(t) && notTop(t)).map(searchTrackRow);
  const videos = tracks.filter((t) => !albumNameOf(t) && notTop(t)).map(searchTrackRow);
  const artists = results.filter((i) => isArtist(i) && notTop(i));
  const albums = results.filter((i) => isAlbum(i) && notTop(i));
  const playlists = results.filter((i) => isPlaylist(i) && notTop(i));
  const topArtistName = top && isArtist(top) ? getName(top) : null;

  // The top artist's radio, from the same browse the artist page uses (and that opening it would need anyway).
  const topArtist = top && isArtist(top) ? resolveArtistParams(top) : null;
  const { data: topArtistData } = useQuery({
    ...artistQueryOptions(topArtist?.artistId, topArtist?.serviceId, topArtist?.accountId, topArtist?.defaults),
    enabled: !!(topArtist?.artistId && topArtist.serviceId && topArtist.accountId),
  });
  const radio = topArtist ? topArtistData?.playlists.find((p) => /radio/i.test(p.title ?? '')) : undefined;

  // For an artist, Songs leads with the artist's own top songs (the search's picks run to live cuts, remixes and
  // other people's tracks); the search's songs follow under See all.
  const songs =
    topArtist && topArtistData?.topSongs.length
      ? withTopSongs(topArtistData.topSongs.map(topSongRow), searchSongs)
      : searchSongs;
  // With no songs at all, the videos take the songs' place beside the top result, unfolded.
  const videosLead = songs.length === 0 && videos.length > 0;
  const rowTracks = [...songs, ...videos]; // one index space, so a selection can span both lists

  const prefetchAlbum = (item: SonosItem) => {
    const { albumId, serviceId, accountId, defaults } = resolveAlbumParams(item);
    if (albumId && serviceId && accountId)
      void queryClient.prefetchQuery(albumQueryOptions(albumId, serviceId, accountId, defaults));
  };
  const prefetchArtist = (item: SonosItem) => {
    const { artistId, serviceId, accountId, defaults } = resolveArtistParams(item);
    if (artistId && serviceId && accountId)
      void queryClient.prefetchQuery(artistQueryOptions(artistId, serviceId, accountId, defaults));
  };

  const albumKey = albums.slice(0, 3).map(objectIdOf).join(',');
  useEffect(() => {
    albums.slice(0, 3).forEach(prefetchAlbum);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the albums' ids, not the array identity
  }, [albumKey]);

  function openArtist(artists: SongRow['artists'], name: string) {
    const a = artists.find((x) => x.name === name);
    if (a?.id?.objectId) openItem(artistItem(name, a.id));
    else void resolveAndOpen(name, 'artist');
  }

  function handleTrackClick(i: number, e: React.MouseEvent) {
    if (e.shiftKey && lastSelected.current !== null) {
      const lo = Math.min(lastSelected.current, i);
      const hi = Math.max(lastSelected.current, i);
      setSelected((prev) => {
        const next = new Set(prev);
        for (let j = lo; j <= hi; j++) next.add(j);
        return next;
      });
    } else if (e.ctrlKey || e.metaKey) {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(i)) next.delete(i);
        else next.add(i);
        return next;
      });
      lastSelected.current = i;
    } else if (selected.size === 1 && selected.has(i)) {
      setSelected(new Set());
      lastSelected.current = null;
    } else {
      setSelected(new Set([i]));
      lastSelected.current = i;
    }
  }

  function handleDragStart(e: React.DragEvent, i: number) {
    const toMove = selected.has(i) ? [...selected].sort((a, b) => a - b) : [i];
    if (!selected.has(i)) {
      setSelected(new Set([i]));
      lastSelected.current = i;
    }
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/sonos-item-list', JSON.stringify(toMove.map((idx) => rowTracks[idx].item)));
    createDragGhost(toMove.length > 1 ? `${toMove.length} tracks` : rowTracks[i].title, e.dataTransfer);
  }

  const clearSelection = () => {
    setSelected(new Set());
    lastSelected.current = null;
  };

  const trackRow = (r: SongRow, i: number) => {
    const albumItem = rowAlbumItem(r);
    const names = r.artists.map((a) => a.name).join(', ');
    return (
      <TrackRow
        key={`${r.key}-${i}`}
        title={r.title}
        artists={names ? <ArtistLinks artist={names} onOpenArtist={(n) => openArtist(r.artists, n)} /> : undefined}
        imageUrl={r.imageUrl}
        explicit={r.explicit}
        aside={r.album?.name}
        trailing={r.durationMs ? fmtTime(r.durationMs) : undefined}
        onOpen={albumItem ? () => openItem(albumItem) : undefined}
        onMouseEnter={albumItem ? () => prefetchAlbum(albumItem) : undefined}
        onAdd={() => void onAddToQueue(r.item)}
        selected={selected.has(i)}
        onClick={(e) => {
          e.stopPropagation();
          handleTrackClick(i, e);
        }}
        onContextMenu={(e) => showTrackMenu({ track: buildTrackPayload(r), sonosItem: r.item }, e)}
        onDragStart={(e) => handleDragStart(e, i)}
      />
    );
  };
  // data-rows-wrap: the whole title shows, over two lines at most, so a version suffix is never cut off.
  const rowList = (rows: SongRow[], offset: number) => (
    <ul className={styles.list} data-search-rows="" data-rows-wrap="" onClick={clearSelection}>
      {rows.map((r, j) => trackRow(r, offset + j))}
    </ul>
  );

  const shelf = (title: string, items: SonosItem[], tile: (item: SonosItem) => React.ReactNode) =>
    items.length > 0 ? (
      <SectionCard className={styles.section}>
        <Carousel title={title} gap="1.1em">
          {items.map((item, i) => (
            <div key={`${objectIdOf(item) ?? ''}-${i}`} className={styles.cell}>
              {tile(item)}
            </div>
          ))}
        </Carousel>
      </SectionCard>
    ) : null;

  // The lower sections follow the service's resourceOrder (parseServiceSearch keeps it).
  const lower = [
    {
      at: results.findIndex(isArtist),
      node: shelf('Artists', artists, (a) => (
        <ImageTile
          title={getName(a)}
          imageUrl={getItemArt(a)}
          circular
          onOpen={() => openItem(a)}
          onHover={() => prefetchArtist(a)}
        />
      )),
    },
    {
      at: results.findIndex(isAlbum),
      node: shelf('Albums', albums, (a) => (
        <ImageTile
          title={getName(a)}
          sub={albumSub(a, topArtistName)}
          imageUrl={getItemArt(a)}
          onOpen={() => openItem(a)}
          onHover={() => prefetchAlbum(a)}
          onAdd={() => void onAddToQueue(a)}
        />
      )),
    },
    {
      at: results.findIndex(isPlaylist),
      node: shelf('Playlists', playlists, (p) => (
        <ImageTile
          title={getName(p)}
          sub={playlistSub(p)}
          imageUrl={getItemArt(p)}
          onOpen={() => openItem(p)}
          onAdd={() => void onAddToQueue(p)}
        />
      )),
    },
  ]
    .filter((s) => s.node)
    .sort((a, b) => a.at - b.at);

  const visibleSongs = songsOpen ? songs : songs.slice(0, SONGS_SHOWN);

  return (
    <div className={styles.results} onClickCapture={onEngage}>
      <div className={`${styles.lead} ${!top || (songs.length === 0 && !videosLead) ? styles.leadSolo : ''}`}>
        {top && (
          <TopResult
            item={top}
            stats={stats}
            radio={radio}
            onOpen={() => {
              const albumItem = isTrack(top) ? albumItemOf(top) : null;
              if (albumItem) openItem(albumItem);
              else if (isTrack(top) && top.artists?.[0]) openArtist(searchTrackRow(top).artists, top.artists[0].name);
              else openItem(top);
            }}
            onAdd={() => void onAddToQueue(top)}
            openItem={openItem}
            onHover={() =>
              isArtist(top) ? prefetchArtist(top) : prefetchAlbum(isTrack(top) ? (albumItemOf(top) ?? top) : top)
            }
            onContextMenu={
              isTrack(top)
                ? (e) => showTrackMenu({ track: buildTrackPayload(searchTrackRow(top)), sonosItem: top }, e)
                : undefined
            }
          />
        )}
        {songs.length > 0 && (
          <SectionCard
            className={styles.songs}
            title="Songs"
            actions={
              songs.length > SONGS_SHOWN ? (
                <SeeAll
                  label={songsOpen ? 'Show fewer' : `See all (${songs.length})`}
                  onClick={() => setSongsOpen((o) => !o)}
                />
              ) : undefined
            }
          >
            {rowList(visibleSongs, 0)}
          </SectionCard>
        )}
        {videosLead && (
          <SectionCard className={styles.songs} title={`Videos and uploads (${videos.length})`}>
            {rowList(videos, 0)}
          </SectionCard>
        )}
      </div>

      {lower.map((s, i) => (
        <div key={i}>{s.node}</div>
      ))}

      {videos.length > 0 && !videosLead && (
        <SectionCard
          className={styles.section}
          title={`Videos and uploads (${videos.length})`}
          actions={<SeeAll label={videosOpen ? 'Hide' : 'Show'} onClick={() => setVideosOpen((o) => !o)} />}
        >
          {videosOpen ? (
            rowList(videos, songs.length)
          ) : (
            <p className={styles.note}>Lyric videos, covers and other uploads that aren’t on an album.</p>
          )}
        </SectionCard>
      )}
    </div>
  );
}

function TopResult({
  item,
  stats,
  radio,
  onOpen,
  onAdd,
  openItem,
  onHover,
  onContextMenu,
}: {
  item: SonosItem;
  stats: StatsResult | undefined;
  radio: SonosItem | undefined;
  onOpen: () => void;
  onAdd: () => void;
  openItem: (item: SonosItem) => void;
  onHover: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const name = getName(item);
  const oid = objectIdOf(item);
  const art = getItemArt(item);
  const imageUrl = art ? withArtworkSize(art, 1200) : null;
  const add = (
    <PillButton variant="primary" onClick={onAdd}>
      <Plus size={16} aria-hidden="true" /> Add to queue
    </PillButton>
  );

  let meta: string;
  let actions: React.ReactNode;
  let count: number | undefined;
  if (isArtist(item)) {
    meta = 'Artist';
    actions = (
      <>
        <PillButton variant="primary" onClick={() => openItem(item)}>
          Open
        </PillButton>
        {radio && (
          <PillButton onClick={() => openItem(radio)}>
            <Radio size={16} aria-hidden="true" /> Radio
          </PillButton>
        )}
      </>
    );
    count = officeCountFor(stats?.topArtists, resolveArtistParams(item).artistId, name);
  } else if (isTrack(item)) {
    meta = [albumNameOf(item) ? 'Song' : 'Video', artistNamesOf(item), albumNameOf(item)].filter(Boolean).join(' · ');
    actions = add;
    count = stats?.topTracks?.find((t) => t.uri && t.uri === oid)?.count;
  } else if (isAlbum(item)) {
    meta = albumSub(item, null) || 'Album';
    actions = add;
    count = stats?.topAlbums?.find((a) => a.albumId && a.albumId === oid)?.count;
  } else {
    // A station can only start by replacing the shared queue: open it instead, to add its songs.
    meta = [isProgram(item) ? 'Station' : 'Playlist', playlistSub(item)].filter(Boolean).join(' · ');
    actions = canQueueWhole(item) ? (
      add
    ) : (
      <PillButton variant="primary" onClick={onOpen}>
        Open
      </PillButton>
    );
  }

  return (
    <TopResultCard
      className={styles.top}
      title={name}
      meta={meta}
      imageUrl={imageUrl}
      explicit={!!item.explicit}
      onOpen={onOpen}
      openLabel={isArtist(item) ? `${name}, open artist` : isTrack(item) ? `${name}, open album` : `${name}, open`}
      onMouseEnter={onHover}
      onContextMenu={onContextMenu}
    >
      {actions}
      <OfficeChip count={count} />
    </TopResultCard>
  );
}
