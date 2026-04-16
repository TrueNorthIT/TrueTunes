import { useEffect } from 'react';
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

      <div className={styles.tracks}>
        {isLoading && <div className={styles.msg}>Loading\u2026</div>}
        {error    && <div className={styles.msg}>Failed to load tracks.</div>}
        {data?.tracks.map((track) => (
          <div key={track.id.objectId ?? track.ordinal} className={styles.trackRow}>
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
              onClick={() => onAddToQueue(track.raw)}
            >
              +
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
