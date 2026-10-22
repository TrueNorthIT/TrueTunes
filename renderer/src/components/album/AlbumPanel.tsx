import { Fragment, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ListPlus } from 'lucide-react';
import { useImage } from '../../hooks/useImage';
import { useAlbumBrowse, albumQueryOptions } from '../../hooks/useAlbumBrowse';
import { usePlaylistBrowse } from '../../hooks/usePlaylistBrowse';
import { useDominantColor } from '../../hooks/useDominantColor';
import { usePageArt } from '../../lib/pageArt';
import { useGeniusAlbumYear } from '../../hooks/useGeniusAlbumYear';
import { artistQueryOptions } from '../../hooks/useArtistBrowse';
import { useResolveAndOpen } from '../../hooks/useResolveAndOpen';
import { useOpenItem } from '../../hooks/useOpenItem';
import { useStats } from '../../hooks/useStats';
import { useReleaseTrackCounts } from '../../hooks/useReleaseTrackCounts';
import { useReleaseYears } from '../../hooks/useReleaseYears';
import type { PlaybackState } from '../../hooks/usePlayback';
import {
  resolveAlbumParams, isPlaylist, isProgram, getItemArt, getName, splitArtists,
} from '../../lib/itemHelpers';
import { withArtworkSize } from '../../lib/artworkUrl';
import { cardSubtitle } from '../../lib/artistSubtitle';
import { moreByReleases } from '../../lib/moreBy';
import { createDragGhost } from '../../lib/dragHelpers';
import { ExplicitBadge } from '../common/ExplicitBadge';
import { HeroBand } from '../common/HeroBand';
import { ImageTile } from '../common/ImageTile';
import { OfficeChip } from '../common/OfficeChip';
import { PillButton } from '../common/PillButton';
import { SectionCard } from '../common/SectionCard';
import { AlbumTrackRow } from './AlbumTrackRow';
import type { SonosItem, SonosItemId } from '../../types/sonos';
import styles from '../../styles/AlbumPanel.module.css';

interface Props {
  onAddToQueue: (item: SonosItem) => Promise<void> | void;
  /** Live playback, to mark the track that is playing. Optional. */
  playback?: PlaybackState;
}

export function AlbumPanel({ onAddToQueue, playback }: Props) {
  const { state } = useLocation();
  const item = (state as { item?: SonosItem } | null)?.item;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const openItem = useOpenItem();
  const { resolveAndOpen } = useResolveAndOpen();

  const isPlaylistOrProgram = item ? (isPlaylist(item) || isProgram(item)) : false;
  const { albumId, serviceId, accountId, defaults } = item
    ? resolveAlbumParams(item)
    : { albumId: undefined, serviceId: undefined, accountId: undefined, defaults: undefined };
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const lastSelected = useRef<number | null>(null);
  const [adding, setAdding] = useState(false);

  const albumResult    = useAlbumBrowse(isPlaylistOrProgram ? undefined : albumId, serviceId, accountId, defaults);
  const playlistResult = usePlaylistBrowse(isPlaylistOrProgram ? albumId : undefined, serviceId, accountId, defaults);

  const isLoading = isPlaylistOrProgram ? playlistResult.isLoading : albumResult.isLoading;
  const error     = isPlaylistOrProgram ? playlistResult.error     : albumResult.error;
  const refetch   = isPlaylistOrProgram ? playlistResult.refetch   : albumResult.refetch;
  const data = isPlaylistOrProgram
    ? playlistResult.data
      ? { title: null, artist: null, artUrl: null, tracks: playlistResult.data, totalTracks: playlistResult.data.length, artistItem: null }
      : null
    : (albumResult.data ?? null);

  // The artist's browse is prefetched on arrival (the header link and the "More by" shelf both want it),
  // and usually already cached from the page that led here.
  const artistRid = data?.artistItem?.resource?.id as SonosItemId | undefined;
  const artistReady = !!(artistRid?.objectId && artistRid.serviceId && artistRid.accountId);
  const { data: artistData } = useQuery({
    ...artistQueryOptions(artistRid?.objectId, artistRid?.serviceId, artistRid?.accountId, undefined),
    enabled: artistReady && !isPlaylistOrProgram,
  });
  // Same grouping, years and track counts as the artist page (and the same caches).
  const releases = artistData?.albums ?? [];
  const { counts: releaseCounts } = useReleaseTrackCounts(releases);
  const { years: releaseYears } = useReleaseYears(releases, artistData?.name);

  const title  = data?.title  ?? item?.title  ?? item?.name  ?? '';
  const artist = data?.artist ?? ((item as Record<string, unknown>)?.['subtitle'] as string) ?? '';
  const artUrl = data?.artUrl ?? (item ? getItemArt(item) : null);
  // The header art is large, so ask the service for a big image.
  const cachedArt     = useImage(artUrl ? withArtworkSize(artUrl, 600) : null);
  const dominantColor = useDominantColor(cachedArt, { setGlobal: true });
  usePageArt(cachedArt);
  const year = useGeniusAlbumYear(
    isPlaylistOrProgram ? null : title,
    isPlaylistOrProgram ? null : artist,
  );

  // Office layer: how often this album has been queued here, from the all-time chart.
  const { data: stats } = useStats('alltime', undefined, 100);
  const queuedHere = isPlaylistOrProgram
    ? 0
    : (stats?.topAlbums ?? []).find(a =>
        (albumId && a.albumId === albumId) || (!!title && a.album.trim().toLowerCase() === title.trim().toLowerCase()),
      )?.count ?? 0;

  useEffect(() => {
    setSelected(new Set());
    lastSelected.current = null;
  }, [albumId]);

  if (!item) return null;

  const trackServiceId  = (data?.tracks[0]?.id as SonosItemId | undefined)?.serviceId  ?? serviceId ?? '';
  const trackAccountId  = (data?.tracks[0]?.id as SonosItemId | undefined)?.accountId ?? accountId ?? '';

  function handleTrackClick(index: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (e.shiftKey && lastSelected.current !== null) {
      const lo = Math.min(lastSelected.current, index);
      const hi = Math.max(lastSelected.current, index);
      setSelected(prev => { const next = new Set(prev); for (let i = lo; i <= hi; i++) next.add(i); return next; });
    } else if (e.ctrlKey || e.metaKey) {
      setSelected(prev => { const next = new Set(prev); if (next.has(index)) next.delete(index); else next.add(index); return next; });
      lastSelected.current = index;
    } else {
      if (selected.size === 1 && selected.has(index)) { setSelected(new Set()); lastSelected.current = null; }
      else { setSelected(new Set([index])); lastSelected.current = index; }
    }
  }

  function handleTrackDragStart(index: number, e: React.DragEvent) {
    if (!data) return;
    const toMove = selected.has(index) ? [...selected].sort((a, b) => a - b) : [index];
    if (!selected.has(index)) { setSelected(new Set([index])); lastSelected.current = index; }
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/sonos-item-list', JSON.stringify(toMove.map(idx => data.tracks[idx].raw)));
    createDragGhost(toMove.length > 1 ? `${toMove.length} tracks` : data.tracks[index].title, e.dataTransfer);
  }

  const totalSecs = data?.tracks.reduce((s, t) => s + t.durationSeconds, 0) ?? 0;
  const totalMins = Math.round(totalSecs / 60);
  const anyExplicit = !!data?.tracks.some(t => t.explicit);

  function openArtist() {
    if (!data?.artistItem) return;
    const rid = data.artistItem.resource?.id as SonosItemId | undefined;
    navigate(`/artist/${encodeURIComponent(rid?.objectId ?? '_')}`, { state: { item: data.artistItem } });
  }

  // Multi-artist subtitles ("Sonny Stitt, Kenny Garrett") arrive as a single string.
  // Split on commas so each artist gets its own link; only the single-artist case
  // can use the cached artistItem for direct navigation.
  const artistParts = splitArtists(artist);

  // More by this artist: their other releases, without this album's own versions or its singles.
  const moreAlbums = moreByReleases(
    releases,
    { albumId, title, trackTitles: data?.tracks.map(t => t.title) ?? [] },
    releaseCounts,
    releaseYears,
  );
  const artistName = artistData?.name || artistParts[0] || '';

  const meta = data
    ? [data.totalTracks + ' songs', totalMins > 0 ? totalMins + ' min' : null, year].filter(Boolean).join(' · ')
    : '';

  return (
    <div className={`page-scale ${styles.panel}`}>
      <div className={styles.page}>
        <HeroBand
          wash={dominantColor}
          art={cachedArt ? <img src={cachedArt} alt="" /> : <div className={styles.artPh}>♪</div>}
          kind={isPlaylistOrProgram ? 'Playlist' : 'Album'}
          title={<>{title}{anyExplicit && <ExplicitBadge />}</>}
        >
            {artistParts.length > 0 && (
              <div className={styles.artist}>
                {artistParts.length === 1 && data?.artistItem ? (
                  <button className={styles.link} onClick={openArtist}>
                    {artistParts[0]}
                  </button>
                ) : (
                  artistParts.map((name, i) => (
                    <Fragment key={i}>
                      {i > 0 && ', '}
                      <button
                        className={styles.link}
                        onClick={() => resolveAndOpen(name, 'artist', { serviceId, accountId })}
                      >
                        {name}
                      </button>
                    </Fragment>
                  ))
                )}
              </div>
            )}
            {data && <div className={styles.metaLine}>{meta}</div>}
            <OfficeChip count={queuedHere} />
            <div className={styles.actions}>
              <PillButton
                variant="primary"
                disabled={adding || !data?.tracks?.length}
                onClick={async () => {
                  if (!item || !data?.tracks?.length) return;
                  setAdding(true);
                  try { await onAddToQueue(item); }
                  finally { setAdding(false); }
                }}
              >
                <ListPlus size={16} aria-hidden="true" />
                {adding ? 'Adding…' : 'Add to queue'}
              </PillButton>
            </div>
        </HeroBand>

        <SectionCard className={`${styles.section} ${styles.trackCard}`}>
          <div
            className={styles.tracks}
            onClick={() => { setSelected(new Set()); lastSelected.current = null; }}
          >
            {isLoading && (
              <div aria-busy="true">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className={styles.skeletonRow}>
                    <span className={`skeleton ${styles.skelNum}`} />
                    <span className={`skeleton ${styles.skelTitle}`} style={{ width: `${35 + (i % 4) * 12}%`, animationDelay: `${i * 60}ms` }} />
                  </div>
                ))}
              </div>
            )}
            {error && (
              <div className={styles.msg}>
                Failed to load tracks.
                <PillButton onClick={() => void refetch()}>Try again</PillButton>
              </div>
            )}
            {!error && data && data.tracks.length === 0 && <div className={styles.msg}>No tracks found.</div>}
            {data && data.tracks.length > 0 && (
              <ul className={styles.list}>
                {data.tracks.map((track, i) => (
                  <AlbumTrackRow
                    key={track.id.objectId ?? track.ordinal}
                    track={track}
                    isPlaylistOrProgram={isPlaylistOrProgram}
                    isSelected={selected.has(i)}
                    serviceId={trackServiceId}
                    accountId={trackAccountId}
                    albumArtist={isPlaylistOrProgram ? undefined : artist}
                    playing={!!playback?.isVisible && !!track.id.objectId && track.id.objectId === playback.currentObjectId}
                    onClick={e => handleTrackClick(i, e)}
                    onDragStart={e => handleTrackDragStart(i, e)}
                    onAdd={() => onAddToQueue(track.raw)}
                  />
                ))}
              </ul>
            )}
          </div>
        </SectionCard>

        {moreAlbums.length > 0 && (
          <SectionCard className={styles.section} title={`More by ${artistName}`}>
            <div className={styles.shelf}>
              {moreAlbums.map(({ item: a, year: y }, i) => {
                const p = resolveAlbumParams(a);
                return (
                  <ImageTile
                    key={p.albumId ?? i}
                    title={getName(a)}
                    sub={cardSubtitle(y, (a as Record<string, unknown>)['subtitle'] as string | undefined, artistName)}
                    imageUrl={getItemArt(a)}
                    onOpen={() => openItem(a)}
                    onHover={() => {
                      if (p.albumId && p.serviceId && p.accountId)
                        void queryClient.prefetchQuery(albumQueryOptions(p.albumId, p.serviceId, p.accountId, p.defaults));
                    }}
                  />
                );
              })}
            </div>
          </SectionCard>
        )}
      </div>
    </div>
  );
}
