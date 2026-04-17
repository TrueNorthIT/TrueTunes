import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useImage } from '../hooks/useImage';

function TrackArt({ url }: { url: string | null }) {
  const src = useImage(url);
  return src ? <img className={styles.trackArt} src={src} alt="" /> : <div className={styles.trackArtPh} />;
}
import { ExplicitBadge } from './ExplicitBadge';
import { useAlbumBrowse } from '../hooks/useAlbumBrowse';
import { usePlaylistBrowse } from '../hooks/usePlaylistBrowse';
import { useDominantColor } from '../hooks/useDominantColor';
import { artistQueryOptions } from '../hooks/useArtistBrowse';
import { fmtDuration, resolveAlbumParams, isPlaylist, isProgram, getItemArt } from '../lib/itemHelpers';
import type { SonosItem, SonosItemId } from '../types/sonos';
import styles from '../styles/AlbumPanel.module.css';

interface Props {
  onAddToQueue: (item: SonosItem) => void;
}

export function AlbumPanel({ onAddToQueue }: Props) {
  const { state } = useLocation();
  const item = (state as { item?: SonosItem } | null)?.item;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isPlaylistOrProgram = item ? (isPlaylist(item) || isProgram(item)) : false;
  const { albumId, serviceId, accountId, defaults } = item ? resolveAlbumParams(item) : { albumId: undefined, serviceId: undefined, accountId: undefined, defaults: undefined };
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const lastSelected = useRef<number | null>(null);

  const albumResult    = useAlbumBrowse(isPlaylistOrProgram ? undefined : albumId, serviceId, accountId, defaults);
  const playlistResult = usePlaylistBrowse(isPlaylistOrProgram ? albumId : undefined, serviceId, accountId, defaults);

  const isLoading = isPlaylistOrProgram ? playlistResult.isLoading : albumResult.isLoading;
  const error     = isPlaylistOrProgram ? playlistResult.error     : albumResult.error;
  const data = isPlaylistOrProgram
    ? playlistResult.data
      ? {
          title: null,
          artist: null,
          artUrl: null,
          tracks: playlistResult.data,
          totalTracks: playlistResult.data.length,
          artistItem: null,
        }
      : null
    : (albumResult.data ?? null);

  // Prefetch artist as soon as we know who the artist is
  useEffect(() => {
    if (!data?.artistItem) return;
    const rid = data.artistItem.resource?.id as SonosItemId | undefined;
    if (!rid?.objectId || !rid?.serviceId || !rid?.accountId) return;
    queryClient.prefetchQuery(artistQueryOptions(rid.objectId, rid.serviceId, rid.accountId, undefined));
  }, [queryClient, data?.artistItem]);

  // Show item fields instantly as fallback while loading
  const title  = data?.title  ?? item?.title  ?? item?.name  ?? '';
  const artist = data?.artist ?? ((item as Record<string, unknown>)?.['subtitle'] as string) ?? '';
  const artUrl = data?.artUrl ?? (item ? getItemArt(item) : null);
  const cachedArt     = useImage(artUrl);
  const dominantColor = useDominantColor(cachedArt);

  // Clear selection when album changes
  useEffect(() => {
    setSelected(new Set());
    lastSelected.current = null;
  }, [albumId]);

  if (!item) return null;

  function handleTrackClick(index: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (e.shiftKey && lastSelected.current !== null) {
      const lo = Math.min(lastSelected.current, index);
      const hi = Math.max(lastSelected.current, index);
      setSelected((prev) => {
        const next = new Set(prev);
        for (let i = lo; i <= hi; i++) next.add(i);
        return next;
      });
    } else if (e.ctrlKey || e.metaKey) {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(index)) next.delete(index);
        else next.add(index);
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

  const headerStyle = dominantColor
    ? {
        background: `linear-gradient(180deg, rgba(${dominantColor}, 0.55) 0%, rgba(${dominantColor}, 0.2) 60%, transparent 100%)`,
        transition: 'background 0.8s ease',
      }
    : undefined;

  function openArtist() {
    if (!data?.artistItem) return;
    const rid = data.artistItem.resource?.id as SonosItemId | undefined;
    navigate(`/artist/${encodeURIComponent(rid?.objectId ?? '_')}`, { state: { item: data.artistItem } });
  }

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
                {[data.totalTracks + ' songs', totalMins > 0 ? totalMins + ' min' : null]
                  .filter(Boolean)
                  .join(' \u2022 ')}
              </div>
            )}
            <div className={styles.actions}>
              <button className={styles.addAlbumBtn} onClick={() => {
                if (data?.tracks?.length) {
                  data.tracks.forEach(t => onAddToQueue(t.raw));
                } else {
                  onAddToQueue(item);
                }
              }}>
                + Add to Queue
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        className={styles.tracks}
        style={
          {
            '--track-cols': isPlaylistOrProgram ? '24px 42px 1fr 260px 260px 50px 28px' : '24px 1fr 160px 50px 28px',
          } as React.CSSProperties
        }
        onClick={() => {
          setSelected(new Set());
          lastSelected.current = null;
        }}
      >
        {/* Table header */}
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
            <div className={styles.spinnerWrap}>
              <div className={styles.spinner} />
            </div>
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className={styles.skeletonRow}>
                <div className={styles.skeletonOrdinal} />
                {isPlaylistOrProgram && <div className={styles.skeletonArt} />}
                <div className={styles.skeletonTitle} style={{ width: `${55 + (i % 4) * 10}%` }} />
                <div className={styles.skeletonSub} style={{ width: `${30 + (i % 3) * 10}%` }} />
                {isPlaylistOrProgram && (
                  <div className={styles.skeletonSub} style={{ width: `${35 + (i % 2) * 15}%` }} />
                )}
                <div className={styles.skeletonDur} />
                <div />
              </div>
            ))}
          </>
        )}
        {error && <div className={styles.msg}>Failed to load tracks.</div>}
        {data?.tracks.map((track, i) => (
          <div
            key={track.id.objectId ?? track.ordinal}
            className={[styles.trackRow, selected.has(i) ? styles.selected : ''].filter(Boolean).join(' ')}
            draggable
            onClick={(e) => handleTrackClick(i, e)}
            onDragStart={(e) => {
              const toMove = selected.has(i) ? [...selected].sort((a, b) => a - b) : [i];
              if (!selected.has(i)) {
                setSelected(new Set([i]));
                lastSelected.current = i;
              }
              e.dataTransfer.effectAllowed = 'copy';
              const items = toMove.map((idx) => data!.tracks[idx].raw);
              e.dataTransfer.setData('application/sonos-item-list', JSON.stringify(items));
              const ghost = document.createElement('div');
              Object.assign(ghost.style, {
                position: 'fixed',
                top: '-100px',
                left: '0',
                background: 'rgba(255,255,255,0.15)',
                backdropFilter: 'blur(8px)',
                color: '#fff',
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '600',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
              });
              ghost.textContent = toMove.length > 1 ? `${toMove.length} tracks` : track.title;
              document.body.appendChild(ghost);
              e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, 20);
              setTimeout(() => ghost.remove(), 0);
            }}
          >
            <span className={styles.ordinal}>{track.ordinal}</span>
            {isPlaylistOrProgram && (
              <div className={styles.trackArtWrap}>
                <TrackArt url={track.artUrl} />
              </div>
            )}
            <div className={styles.trackName}>
              {track.title}
              {track.explicit && <ExplicitBadge />}
            </div>
            <div className={styles.trackArtist}>
              {isPlaylistOrProgram && track.artistObjects?.length
                ? track.artistObjects.map((a, ai) => {
                    const artistItem: SonosItem = {
                      type: 'ARTIST',
                      name: a.name,
                      resource: {
                        type: 'ARTIST',
                        id: {
                          objectId: a.objectId,
                          serviceId: (data?.tracks[i]?.id as SonosItemId)?.serviceId ?? '',
                          accountId: (data?.tracks[i]?.id as SonosItemId)?.accountId ?? '',
                        },
                      },
                    };
                    return (
                      <span key={ai}>
                        {ai > 0 && ', '}
                        <button
                          className={styles.artistBtn}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(
                              `/artist/${encodeURIComponent(a.objectId)}`,
                              { state: { item: artistItem } },
                            );
                          }}
                        >
                          {a.name}
                        </button>
                      </span>
                    );
                  })
                : track.artists.join(', ')}
            </div>
            {isPlaylistOrProgram && (
              <div className={styles.trackAlbum}>
                {track.albumId && track.albumName
                  ? (
                    <button
                      className={styles.artistBtn}
                      onMouseDown={e => e.stopPropagation()}
                      onClick={e => {
                        e.stopPropagation();
                        navigate(
                          `/album/${encodeURIComponent(track.albumId!)}`,
                          {
                            state: {
                              item: {
                                type: 'ALBUM',
                                name: track.albumName!,
                                resource: {
                                  type: 'ALBUM',
                                  id: {
                                    objectId:  track.albumId!,
                                    serviceId: (track.id as SonosItemId)?.serviceId ?? '',
                                    accountId: (track.id as SonosItemId)?.accountId ?? '',
                                  },
                                },
                              } as SonosItem,
                            },
                          },
                        );
                      }}
                    >
                      {track.albumName}
                    </button>
                  )
                  : (track.albumName ?? '')}
              </div>
            )}
            <span className={styles.duration}>{fmtDuration(track.durationSeconds)}</span>
            <button
              className={styles.addBtn}
              onClick={(e) => {
                e.stopPropagation();
                onAddToQueue(track.raw);
              }}
            >
              +
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
