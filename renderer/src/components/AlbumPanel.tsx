import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useImage } from '../hooks/useImage';
import { ExplicitBadge } from './ExplicitBadge';
import { useAlbumBrowse } from '../hooks/useAlbumBrowse';
import { useDominantColor } from '../hooks/useDominantColor';
import { artistQueryOptions } from '../hooks/useArtistBrowse';
import { fmtDuration, resolveAlbumParams } from '../lib/itemHelpers';
import type { SonosItem, SonosItemId } from '../types/sonos';
import styles from '../styles/AlbumPanel.module.css';

interface Props {
  item: SonosItem;
  onAddToQueue: (item: SonosItem) => void;
  onOpenArtist?: (item: SonosItem) => void;
}

export function AlbumPanel({ item, onAddToQueue, onOpenArtist }: Props) {
  const queryClient = useQueryClient();
  const { albumId, serviceId, accountId, defaults } = resolveAlbumParams(item);
  const [selected, setSelected]     = useState<Set<number>>(new Set());
  const lastSelected                = useRef<number | null>(null);
  const { data, isLoading, error } = useAlbumBrowse(albumId, serviceId, accountId, defaults);

  // Prefetch artist as soon as we know who the artist is
  useEffect(() => {
    if (!data?.artistItem) return;
    const rid = data.artistItem.resource?.id as SonosItemId | undefined;
    if (!rid?.objectId || !rid?.serviceId || !rid?.accountId) return;
    queryClient.prefetchQuery(
      artistQueryOptions(rid.objectId, rid.serviceId, rid.accountId, undefined)
    );
  }, [queryClient, data?.artistItem]);

  // Show item fields instantly as fallback while loading
  const title  = data?.title  ?? item.title  ?? item.name  ?? '';
  const artist = data?.artist ?? (item as Record<string, unknown>)['subtitle'] as string ?? '';
  const artUrl = data?.artUrl
    ?? (item.images as Record<string, string> | undefined)?.['tile1x1']
    ?? item.imageUrl
    ?? null;
  const cachedArt = useImage(artUrl);
  const dominantColor = useDominantColor(cachedArt);

  // Clear selection when album changes
  useEffect(() => { setSelected(new Set()); lastSelected.current = null; }, [albumId]);

  function handleTrackClick(index: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (e.shiftKey && lastSelected.current !== null) {
      const lo = Math.min(lastSelected.current, index);
      const hi = Math.max(lastSelected.current, index);
      setSelected(prev => {
        const next = new Set(prev);
        for (let i = lo; i <= hi; i++) next.add(i);
        return next;
      });
    } else if (e.ctrlKey || e.metaKey) {
      setSelected(prev => {
        const next = new Set(prev);
        if (next.has(index)) next.delete(index); else next.add(index);
        return next;
      });
      lastSelected.current = index;
    } else {
      if (selected.size === 1 && selected.has(index)) {
        setSelected(new Set());
        lastSelected.current = null;
      } else {
        setSelected(new Set([index]));
        lastSelected.current = index;
      }
    }
  }

  const totalSecs = data?.tracks.reduce((s, t) => s + t.durationSeconds, 0) ?? 0;
  const totalMins = Math.round(totalSecs / 60);

  const headerStyle = dominantColor ? {
    background: `linear-gradient(180deg, rgba(${dominantColor}, 0.55) 0%, rgba(${dominantColor}, 0.2) 60%, transparent 100%)`,
    transition: 'background 0.8s ease',
  } : undefined;

  return (
    <div className={styles.panel}>
      <div className={styles.header} style={headerStyle}>
        <div className={styles.headerContent}>
          <div className={styles.artWrap}>
            {cachedArt
              ? <img className={styles.art} src={cachedArt} alt="" />
              : <div className={styles.artPh}>♪</div>
            }
          </div>
          <div className={styles.meta}>
            <div className={styles.albumTitle}>{title}</div>
            {artist && (
              <div
                className={`${styles.artist}${onOpenArtist && data?.artistItem ? ' ' + styles.artistLink : ''}`}
                onClick={() => {
                  if (!onOpenArtist || !data?.artistItem) return;
                  onOpenArtist(data.artistItem);
                }}
              >
                {artist}
              </div>
            )}
            {data && (
              <div className={styles.metaLine}>
                {[
                  data.totalTracks + ' songs',
                  totalMins > 0 ? totalMins + ' min' : null,
                ].filter(Boolean).join(' \u2022 ')}
              </div>
            )}
            <div className={styles.actions}>
              <button className={styles.addAlbumBtn} onClick={() => onAddToQueue(item)}>
                + Add to Queue
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.tracks} onClick={() => { setSelected(new Set()); lastSelected.current = null; }}>
        {isLoading && <div className={styles.msg}>Loading\u2026</div>}
        {error    && <div className={styles.msg}>Failed to load tracks.</div>}
        {data?.tracks.map((track, i) => (
          <div
            key={track.id.objectId ?? track.ordinal}
            className={[styles.trackRow, selected.has(i) ? styles.selected : ''].filter(Boolean).join(' ')}
            draggable
            onClick={e => handleTrackClick(i, e)}
            onDragStart={e => {
              const toMove = selected.has(i) ? [...selected].sort((a, b) => a - b) : [i];
              if (!selected.has(i)) { setSelected(new Set([i])); lastSelected.current = i; }
              e.dataTransfer.effectAllowed = 'copy';
              const items = toMove.map(idx => data!.tracks[idx].raw);
              e.dataTransfer.setData('application/sonos-item-list', JSON.stringify(items));
              const ghost = document.createElement('div');
              Object.assign(ghost.style, {
                position: 'fixed', top: '-100px', left: '0',
                background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)',
                color: '#fff', padding: '5px 12px', borderRadius: '6px',
                fontSize: '12px', fontWeight: '600', pointerEvents: 'none',
                whiteSpace: 'nowrap',
              });
              ghost.textContent = toMove.length > 1 ? `${toMove.length} tracks` : track.title;
              document.body.appendChild(ghost);
              e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, 20);
              setTimeout(() => ghost.remove(), 0);
            }}
          >
            <span className={styles.ordinal}>{track.ordinal}</span>
            <div className={styles.trackText}>
              <div className={styles.trackName}>
                {track.title}{track.explicit && <ExplicitBadge />}
              </div>
              {track.artists.length > 0 && (
                <div className={styles.trackArtist}>{track.artists.join(', ')}</div>
              )}
            </div>
            <span className={styles.duration}>{fmtDuration(track.durationSeconds)}</span>
            <button
              className={styles.addBtn}
              onClick={e => { e.stopPropagation(); onAddToQueue(track.raw); }}
            >
              +
            </button>
          </div>
        ))}
      </div>
      {selected.size > 0 && (
        <div className={styles.selBar}>
          <span>{selected.size} track{selected.size !== 1 ? 's' : ''} selected</span>
          <button className={styles.selAddBtn} onClick={() => {
            if (!data) return;
            [...selected].sort((a, b) => a - b).forEach(idx => onAddToQueue(data.tracks[idx].raw));
            setSelected(new Set());
          }}>
            + Add to Queue
          </button>
        </div>
      )}
    </div>
  );
}
