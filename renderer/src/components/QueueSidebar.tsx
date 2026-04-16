import { forwardRef, useEffect, useImperativeHandle, useRef, useState, Fragment } from 'react';
import { Loader2 } from 'lucide-react';
import { getName } from '../lib/itemHelpers';
import { useImage } from '../hooks/useImage';
import { useQueueTrack } from '../hooks/useQueueTrack';
import { ExplicitBadge } from './ExplicitBadge';
import type { QueueItem, SonosItem } from '../types/sonos';
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
  onAddToQueue: (item: SonosItem, position: number) => void;
}

export interface QueueSidebarHandle {
  scrollToPlaying: () => void;
}

// ── Individual draggable row ──────────────────────────────────────────────────

interface RowProps {
  item: QueueItem;
  index: number;
  currentObjectId: string | null;
  onOpenAlbum: (item: SonosItem) => void;
  isSelected: boolean;
  onRowClick: (index: number, e: React.MouseEvent) => void;
  onDragStart: (index: number, e: React.DragEvent) => void;
  onDragOver: (index: number, e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

function DraggableQueueRow({
  item, index, currentObjectId, onOpenAlbum,
  isSelected, onRowClick, onDragStart, onDragOver, onDrop, onDragEnd,
}: RowProps) {
  const { artUrl, artist, albumName, albumItem, prefetchAlbum, isPlaying, explicit } =
    useQueueTrack(item, currentObjectId);
  const cachedArt = useImage(artUrl);
  const name = getName(item);

  return (
    <div
      className={[
        styles.row,
        isPlaying  ? styles.playing  : '',
        isSelected ? styles.selected : '',
      ].filter(Boolean).join(' ')}
      data-playing={isPlaying ? 'true' : undefined}
      draggable
      onClick={e => onRowClick(index, e)}
      onDoubleClick={() => window.sonos.skipToTrack(index + 1)}
      onDragStart={e => onDragStart(index, e)}
      onDragOver={e => onDragOver(index, e)}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <div className={styles.dragHandle}>⠿</div>
      <div className={styles.artWrap}>
        {cachedArt
          ? <img className={styles.art} src={cachedArt} alt="" />
          : <div className={styles.artPh}>♪</div>}
        {isPlaying && <div className={styles.overlay}>▶</div>}
      </div>
      <div className={styles.text}>
        <div className={styles.name}>{name}{explicit && <ExplicitBadge />}</div>
        {(artist || albumName) && (
          <div className={styles.sub}>
            {artist}
            {artist && albumName ? ' \u2022 ' : ''}
            {albumName && (
              <button
                className={styles.subLink}
                onClick={e => { e.stopPropagation(); albumItem && onOpenAlbum(albumItem); }}
                onMouseEnter={prefetchAlbum}
              >
                {albumName}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

export const QueueSidebar = forwardRef<QueueSidebarHandle, Props>(function QueueSidebar(
  { open, items, isLoading, error, currentObjectId, onClose, onRefresh, onOpenAlbum, onAddToQueue },
  ref
) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected]         = useState<Set<number>>(new Set());
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const lastSelected = useRef<number | null>(null);
  const draggingSet  = useRef<Set<number>>(new Set());

  useImperativeHandle(ref, () => ({
    scrollToPlaying() {
      const el = contentRef.current?.querySelector<HTMLElement>('[data-playing="true"]');
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    },
  }));

  // Clear selection when sidebar closes or items change
  useEffect(() => { setSelected(new Set()); }, [open, items]);

  // Delete key removes selected tracks
  useEffect(() => {
    if (!open) return;
    async function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (selected.size === 0) return;
      e.preventDefault();
      await window.sonos.removeFromQueue([...selected]);
      setSelected(new Set());
      onRefresh();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, selected]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleRowClick(index: number, e: React.MouseEvent) {
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
      // Click on the sole selected item → deselect; otherwise narrow to this one
      if (selected.size === 1 && selected.has(index)) {
        setSelected(new Set());
        lastSelected.current = null;
      } else {
        setSelected(new Set([index]));
        lastSelected.current = index;
      }
    }
  }

  function handleDragStart(index: number, e: React.DragEvent) {
    const toMove = selected.has(index) ? new Set(selected) : new Set([index]);
    if (!selected.has(index)) { setSelected(toMove); lastSelected.current = index; }
    draggingSet.current = toMove;

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/queue-indices', JSON.stringify([...toMove]));

    // Floating ghost label
    const ghost = document.createElement('div');
    Object.assign(ghost.style, {
      position: 'fixed', top: '-100px', left: '0',
      background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(8px)',
      color: '#fff', padding: '5px 12px', borderRadius: '6px',
      fontSize: '12px', fontWeight: '600', pointerEvents: 'none',
      whiteSpace: 'nowrap', zIndex: '9999',
    });
    const label = toMove.size > 1
      ? `${toMove.size} tracks`
      : (getName(items[index]));
    ghost.textContent = label;
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, 20);
    setTimeout(() => ghost.remove(), 0);
  }

  function handleDragOver(index: number, e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes('application/sonos-item-list') ? 'copy' : 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const insertBefore = e.clientY < rect.top + rect.height / 2 ? index : index + 1;
    setDragOverIndex(insertBefore);
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (dragOverIndex === null) return;

    // External: multiple tracks dragged from album/search panel
    const listJson = e.dataTransfer.getData('application/sonos-item-list');
    if (listJson) {
      setDragOverIndex(null);
      const droppedItems = JSON.parse(listJson) as SonosItem[];
      let pos = dragOverIndex >= items.length ? -1 : dragOverIndex;
      for (let idx = 0; idx < droppedItems.length; idx++) {
        await onAddToQueue(droppedItems[idx], pos === -1 ? -1 : pos + idx);
      }
      onRefresh();
      return;
    }

    // Internal: queue reorder
    const raw = e.dataTransfer.getData('application/queue-indices');
    if (!raw) { setDragOverIndex(null); return; }
    const fromIndices: number[] = JSON.parse(raw);
    setDragOverIndex(null);
    setSelected(new Set());
    await window.sonos.reorderQueue(fromIndices, dragOverIndex, items.length);
    onRefresh();
  }

  function handleDragEnd() {
    setDragOverIndex(null);
    draggingSet.current = new Set();
  }

  // Click on content background deselects
  function handleContentClick() {
    setSelected(new Set());
    lastSelected.current = null;
  }

  const selCount = selected.size;

  return (
    <div className={`${styles.sidebar}${open ? ' ' + styles.open : ''}`}>
      <div className={styles.header}>
        <span className={styles.title}>
          Queue{items.length > 0 ? ` \u00b7 ${items.length}` : ''}
          {selCount > 0 && <span className={styles.selBadge}>{selCount} selected</span>}
        </span>
        <div className={styles.headerActions}>
          <button className={styles.iconBtn} onClick={onRefresh} title="Refresh">↺</button>
          {items.length > 0 && (
            <button className={styles.iconBtn} title="Clear queue" onClick={async () => {
              await window.sonos.clearQueue();
              onRefresh();
            }}>⊘</button>
          )}
          <button className={styles.iconBtn} onClick={onClose} title="Close">✕</button>
        </div>
      </div>

      <div
        className={styles.content}
        ref={contentRef}
        onClick={handleContentClick}
        onDragOver={e => {
          e.preventDefault();
          e.dataTransfer.dropEffect = e.dataTransfer.types.includes('application/sonos-item-list') ? 'copy' : 'move';
          setDragOverIndex(items.length);
        }}
        onDragLeave={e => {
          if (!contentRef.current?.contains(e.relatedTarget as Node)) setDragOverIndex(null);
        }}
        onDrop={handleDrop}
      >
        {isLoading && <div className={styles.msg}><Loader2 size={18} className={styles.spinner} /></div>}
        {error     && <div className={styles.msg}>{error}</div>}
        {!isLoading && !error && items.length === 0 && (
          <div className={styles.msg}>Queue is empty.</div>
        )}
        {!isLoading && !error && items.map((item, i) => (
          <Fragment key={i}>
            {dragOverIndex === i && <div className={styles.dropLine} />}
            <DraggableQueueRow
              item={item}
              index={i}
              currentObjectId={currentObjectId}
              onOpenAlbum={onOpenAlbum}
              isSelected={selected.has(i)}
              onRowClick={handleRowClick}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            />
          </Fragment>
        ))}
        {dragOverIndex === items.length && <div className={styles.dropLine} />}
      </div>

      {selCount > 0 && (
        <div className={styles.selBar}>
          <span>{selCount} track{selCount !== 1 ? 's' : ''} selected</span>
          <button className={styles.selDelBtn} onClick={async () => {
            await window.sonos.removeFromQueue([...selected]);
            setSelected(new Set());
            onRefresh();
          }}>
            Delete
          </button>
        </div>
      )}
    </div>
  );
});
