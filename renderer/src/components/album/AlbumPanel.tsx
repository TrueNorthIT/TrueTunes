import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useImage } from '../../hooks/useImage';
import { useAlbumBrowse } from '../../hooks/useAlbumBrowse';
import { usePlaylistBrowse } from '../../hooks/usePlaylistBrowse';
import { useDominantColor } from '../../hooks/useDominantColor';
import { artistQueryOptions } from '../../hooks/useArtistBrowse';
import { resolveAlbumParams, isPlaylist, isProgram, getItemArt } from '../../lib/itemHelpers';
import { AlbumTrackRow } from './AlbumTrackRow';
import type { SonosItem, SonosItemId } from '../../types/sonos';
import styles from '../../styles/AlbumPanel.module.css';

interface Props {
  onAddToQueue: (item: SonosItem) => Promise<void> | void;
  queueOpen?: boolean;
}

export function AlbumPanel({ onAddToQueue, queueOpen }: Props) {
  const { state } = useLocation();
  const item = (state as { item?: SonosItem } | null)?.item;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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
  const data = isPlaylistOrProgram
    ? playlistResult.data
      ? { title: null, artist: null, artUrl: null, tracks: playlistResult.data, totalTracks: playlistResult.data.length, artistItem: null }
      : null
    : (albumResult.data ?? null);

  useEffect(() => {
    if (!data?.artistItem) return;
    const rid = data.artistItem.resource?.id as SonosItemId | undefined;
    if (!rid?.objectId || !rid?.serviceId || !rid?.accountId) return;
    queryClient.prefetchQuery(artistQueryOptions(rid.objectId, rid.serviceId, rid.accountId, undefined));
  }, [queryClient, data?.artistItem]);

  const title  = data?.title  ?? item?.title  ?? item?.name  ?? '';
  const artist = data?.artist ?? ((item as Record<string, unknown>)?.['subtitle'] as string) ?? '';
  const artUrl = data?.artUrl ?? (item ? getItemArt(item) : null);
  const cachedArt     = useImage(artUrl);
  const dominantColor = useDominantColor(cachedArt);

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
    const ghost = document.createElement('div');
    Object.assign(ghost.style, {
      position: 'fixed', top: '-100px', left: '0',
      background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)',
      color: '#fff', padding: '5px 12px', borderRadius: '6px',
      fontSize: '12px', fontWeight: '600', pointerEvents: 'none', whiteSpace: 'nowrap',
    });
    ghost.textContent = toMove.length > 1 ? `${toMove.length} tracks` : data.tracks[index].title;
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, 20);
    setTimeout(() => ghost.remove(), 0);
  }

  const totalSecs = data?.tracks.reduce((s, t) => s + t.durationSeconds, 0) ?? 0;
  const totalMins = Math.round(totalSecs / 60);

  const headerStyle = dominantColor
    ? { background: `linear-gradient(180deg, rgba(${dominantColor}, 0.55) 0%, rgba(${dominantColor}, 0.2) 60%, transparent 100%)`, transition: 'background 0.8s ease' }
    : undefined;

  function openArtist() {
    if (!data?.artistItem) return;
    const rid = data.artistItem.resource?.id as SonosItemId | undefined;
    navigate(`/artist/${encodeURIComponent(rid?.objectId ?? '_')}`, { state: { item: data.artistItem } });
  }

  const tracksStyle = queueOpen
    ? { paddingRight: 'calc(clamp(300px, 22vw, 420px) + 32px)' }
    : undefined;

  return (
    <div className={styles.panel}>
      <div className={styles.header} style={headerStyle}>
        <div className={styles.headerContent}>
          <div className={styles.artWrap}>
            {cachedArt ? <img className={styles.art} src={cachedArt} alt="" /> : <div className={styles.artPh}>♪</div>}
          </div>
          <div className={styles.meta}>
            <div className={styles.albumTitle}>{title}</div>
            {artist && (
              <div
                className={`${styles.artist}${data?.artistItem ? ' ' + styles.artistLink : ''}`}
                onClick={data?.artistItem ? openArtist : undefined}
              >
                {artist}
              </div>
            )}
            {data && (
              <div className={styles.metaLine}>
                {[data.totalTracks + ' songs', totalMins > 0 ? totalMins + ' min' : null].filter(Boolean).join(' \u2022 ')}
              </div>
            )}
            <div className={styles.actions}>
              <button
                className={styles.addAlbumBtn}
                disabled={adding || !data?.tracks?.length}
                onClick={async () => {
                  if (!item || !data?.tracks?.length) return;
                  setAdding(true);
                  try { await onAddToQueue(item); }
                  finally { setAdding(false); }
                }}
              >
                {adding ? 'Adding…' : '+ Add to Queue'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        className={styles.tracks}
        style={{ '--track-cols': isPlaylistOrProgram ? '24px 42px 1fr 260px 260px 50px 28px' : '24px 1fr 160px 50px 28px', ...tracksStyle } as React.CSSProperties}
        onClick={() => { setSelected(new Set()); lastSelected.current = null; }}
      >
        {data && (
          <div className={styles.tableHeader}>
            <span />
            {isPlaylistOrProgram && <span />}
            <span>Title</span>
            <span>Artist</span>
            {isPlaylistOrProgram && <span>Album</span>}
            <span>Time</span>
            <span />
          </div>
        )}

        {isLoading && (
          <>
            <div className={styles.spinnerWrap}><div className={styles.spinner} /></div>
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className={styles.skeletonRow}>
                <div className={styles.skeletonOrdinal} />
                {isPlaylistOrProgram && <div className={styles.skeletonArt} />}
                <div className={styles.skeletonTitle} style={{ width: `${55 + (i % 4) * 10}%` }} />
                <div className={styles.skeletonSub} style={{ width: `${30 + (i % 3) * 10}%` }} />
                {isPlaylistOrProgram && <div className={styles.skeletonSub} style={{ width: `${35 + (i % 2) * 15}%` }} />}
                <div className={styles.skeletonDur} />
                <div />
              </div>
            ))}
          </>
        )}
        {error && <div className={styles.msg}>Failed to load tracks.</div>}
        {!error && data && data.tracks.length === 0 && <div className={styles.msg}>No tracks found.</div>}
        {data?.tracks.map((track, i) => (
          <AlbumTrackRow
            key={track.id.objectId ?? track.ordinal}
            track={track}
            isPlaylistOrProgram={isPlaylistOrProgram}
            isSelected={selected.has(i)}
            serviceId={trackServiceId}
            accountId={trackAccountId}
            onClick={e => handleTrackClick(i, e)}
            onDragStart={e => handleTrackDragStart(i, e)}
            onAdd={() => onAddToQueue(track.raw)}
          />
        ))}
      </div>
    </div>
  );
}
