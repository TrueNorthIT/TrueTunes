import { forwardRef, useImperativeHandle, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getName, getArt, getArtist, getAlbum, decodeDefaults } from '../lib/itemHelpers';
// decodeDefaults used as fallback for tracks not yet in cache
import { useTrackDetails } from '../hooks/useTrackDetails';
import { albumQueryOptions } from '../hooks/useAlbumBrowse';
import type { QueueItem, SonosAlbum, SonosItem, SonosItemId } from '../types/sonos';
import { ItemRow } from './ItemRow';
import styles from '../styles/QueueSidebar.module.css';

interface Props {
  open: boolean;
  items: QueueItem[];
  isLoading: boolean;
  error: string | null;
  currentObjectId: string | null;
  onClose: () => void;
  onRefresh: () => void;
  onOpenAlbum: (item: SonosItem) => void;
}

export interface QueueSidebarHandle {
  scrollToPlaying: () => void;
}

function QueueRow({ item, index, currentObjectId, onOpenAlbum }: { item: QueueItem; index: number; currentObjectId: string | null; onOpenAlbum: (item: SonosItem) => void }) {
  const queryClient = useQueryClient();
  const id        = item?.track?.id ?? (item?.id as SonosItemId | undefined);
  const trackId   = id?.objectId;
  const serviceId = id?.serviceId;
  const accountId = id?.accountId;

  const { data } = useTrackDetails(trackId, serviceId, accountId);

  const oid     = item?.track?.id?.objectId ?? '';
  const playing = !!currentObjectId && oid === currentObjectId;
  const artUrl  = data?.artUrl ?? getArt(item);
  const artist  = data?.artist ?? getArtist(item);

  // Album: prefer enriched cache, fall back to track.album, then resource.defaults
  const rawAlbum = item?.track?.album;
  const albumObj = typeof rawAlbum === 'object' && rawAlbum !== null ? rawAlbum as SonosAlbum : null;
  const defs     = decodeDefaults(item?.resource?.defaults);

  const albumName  = data?.albumName
    ?? albumObj?.name
    ?? getAlbum(item)
    ?? (defs?.['containerName'] as string | undefined)
    ?? null;
  const albumObjId = data?.albumId
    ?? albumObj?.id?.objectId
    ?? (defs?.['containerId'] as string | undefined)
    ?? null;
  const albumSvcId = data?.serviceId ?? albumObj?.id?.serviceId ?? serviceId;
  const albumAccId = data?.accountId ?? albumObj?.id?.accountId ?? accountId;

  const handleAlbumClick = albumObjId && albumName ? () => onOpenAlbum({
    title: albumName,
    type: 'ITEM_ALBUM',
    resource: { type: 'ALBUM', id: { objectId: albumObjId, serviceId: albumSvcId, accountId: albumAccId } },
  } as SonosItem) : undefined;

  const handleAlbumHover = albumObjId && albumSvcId && albumAccId
    ? () => queryClient.prefetchQuery(albumQueryOptions(albumObjId, albumSvcId, albumAccId, undefined))
    : undefined;

  const explicit = !!(item?.track?.explicit ?? (item?.track as Record<string, unknown> | undefined)?.['isExplicit']);

  return (
    <ItemRow
      name={getName(item)}
      sub={artist || undefined}
      subLink={albumName || undefined}
      onSubLink={handleAlbumClick}
      onSubLinkHover={handleAlbumHover}
      artUrl={artUrl}
      isPlaying={playing}
      explicit={explicit}
      onDoubleClick={() => window.sonos.skipToTrack(index + 1)}
    />
  );
}

export const QueueSidebar = forwardRef<QueueSidebarHandle, Props>(function QueueSidebar(
  { open, items, isLoading, error, currentObjectId, onClose, onRefresh, onOpenAlbum },
  ref
) {
  const contentRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    scrollToPlaying() {
      const el = contentRef.current?.querySelector<HTMLElement>('[data-playing="true"]');
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    },
  }));

  return (
    <div className={`${styles.sidebar}${open ? ' ' + styles.open : ''}`}>
      <div className={styles.header}>
        <span className={styles.title}>
          Queue{items.length > 0 ? ` \u00b7 ${items.length}` : ''}
        </span>
        <div className={styles.headerActions}>
          <button className={styles.iconBtn} onClick={onRefresh} title="Refresh">↺</button>
          <button className={styles.iconBtn} onClick={onClose} title="Close">✕</button>
        </div>
      </div>
      <div className={styles.content} ref={contentRef}>
        {isLoading && <div className={styles.msg}>Loading\u2026</div>}
        {error   && <div className={styles.msg}>{error}</div>}
        {!isLoading && !error && items.length === 0 && (
          <div className={styles.msg}>Queue is empty.</div>
        )}
        {!isLoading && !error && items.map((item, i) => (
          <QueueRow key={i} item={item} index={i} currentObjectId={currentObjectId} onOpenAlbum={onOpenAlbum} />
        ))}
      </div>
    </div>
  );
});
