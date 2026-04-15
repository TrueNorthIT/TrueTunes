import { forwardRef, useImperativeHandle, useRef } from 'react';
import { getName } from '../lib/itemHelpers';
import { useQueueTrack } from '../hooks/useQueueTrack';
import type { QueueItem, SonosItem } from '../types/sonos';
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
  const { artUrl, artist, albumName, albumItem, prefetchAlbum, isPlaying, explicit } =
    useQueueTrack(item, currentObjectId);

  return (
    <ItemRow
      name={getName(item)}
      sub={artist || undefined}
      subLink={albumName || undefined}
      onSubLink={albumItem ? () => onOpenAlbum(albumItem) : undefined}
      onSubLinkHover={prefetchAlbum}
      artUrl={artUrl}
      isPlaying={isPlaying}
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
