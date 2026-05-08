import { useEffect, useImperativeHandle, useMemo, useRef, useState, Fragment, forwardRef } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { applyReorderLocally } from '../../lib/queueHelpers';
import { createDragGhost } from '../../lib/dragHelpers';
import { getActiveProvider } from '../../providers';
import { useAttribution } from '../../hooks/useAttribution';
import { trackQueryOptions } from '../../hooks/useTrackDetails';
import { DraggableQueueRow } from './DraggableQueueRow';
import { WindowControls } from '../WindowControls';
import type { NormalizedQueueItem } from '../../types/provider';
import type { SonosItem } from '../../types/sonos';
import styles from '../../styles/QueueSidebar.module.css';

interface Props {
  items: NormalizedQueueItem[];
  setItems: (updater: NormalizedQueueItem[] | ((prev: NormalizedQueueItem[]) => NormalizedQueueItem[])) => void;
  isLoading: boolean;
  error: string | null;
  currentObjectId: string | null;
  currentQueueItemId: string | null;
  positionMs?: number;
  currentTrackDurationMs?: number;
  groupName: string | null;
  onRefresh: () => void;
  onError: (msg: string) => void;
  onAddToQueue: (item: SonosItem, position: number) => void;
  dockedWidth?: number;
  onResizeWidth?: (width: number) => void;
  onResizeWidthLive?: (width: number) => void;
}

export interface QueueSidebarHandle {
  scrollToNowPlaying: () => void;
}

const MIN_DOCKED_WIDTH = 280;
const PLAYER_BAR_W = 800;   // matches .inner width in PlayerBar.module.css
const PLAYER_BAR_PADDING = 64; // 32px breathing room each side

export const QueueSidebar = forwardRef<QueueSidebarHandle, Props>(function QueueSidebar(
  {
    items,
    setItems,
    isLoading,
    error,
    currentObjectId,
    currentQueueItemId,
    positionMs = 0,
    currentTrackDurationMs = 0,
    groupName,
    onRefresh,
    onError,
    onAddToQueue,
    dockedWidth,
    onResizeWidth,
    onResizeWidthLive,
  },
  ref
) {
  const isActive = true;

  const contentRef = useRef<HTMLDivElement>(null);
  const attributionMap = useAttribution(onRefresh);
  const [selected, setSelected]           = useState<Set<number>>(new Set());
  const [dragOverIndex, setDragOverIndex]  = useState<number | null>(null);
  const [pendingClear, setPendingClear]    = useState(false);
  const lastSelected = useRef<number | null>(null);
  const draggingSet  = useRef<Set<number>>(new Set());

  const trackDetailsResults = useQueries({
    queries: items.map(item => ({
      ...trackQueryOptions(
        item.track.id || '',
        item.track.serviceId ?? '',
        item.track.accountId ?? '',
      ),
      enabled: !!(item.track.id && item.track.serviceId && item.track.accountId),
    })),
  });

  const [nowMs, setNowMs] = useState(0);
  useEffect(() => { setNowMs(Date.now()); }, [positionMs]);

  const timesToPlay = useMemo(() => {
    const result: (number | undefined)[] = new Array(items.length).fill(undefined);
    if (!currentQueueItemId || currentTrackDurationMs <= 0 || nowMs === 0) return result;
    const currentIdx = Number(currentQueueItemId) - 1;
    let acc = Math.max(0, currentTrackDurationMs - positionMs);
    for (let i = currentIdx + 1; i < items.length; i++) {
      result[i] = nowMs + acc;
      const itemDur = trackDetailsResults[i]?.data?.durationMs ?? items[i].track.durationMs;
      if (!itemDur) break;
      acc += itemDur;
    }
    return result;
  }, [items, currentQueueItemId, positionMs, currentTrackDurationMs, trackDetailsResults, nowMs]);

  const [liveWidth, setLiveWidth] = useState<number>(dockedWidth ?? 380);
  useEffect(() => {
    if (typeof dockedWidth === 'number') setLiveWidth(dockedWidth);
  }, [dockedWidth]);
  const liveWidthRef = useRef(liveWidth);
  useEffect(() => { liveWidthRef.current = liveWidth; }, [liveWidth]);

  function scrollToNowPlaying() {
    contentRef.current?.querySelector<HTMLElement>('[data-playing="true"]')
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  useImperativeHandle(ref, () => ({ scrollToNowPlaying }), []);

  useEffect(() => { setSelected(new Set()); }, [items]);

  useEffect(() => {
    if (!isActive) return;
    const id = setTimeout(scrollToNowPlaying, 50);
    return () => clearTimeout(id);
  }, [isActive]);

  // Track change while queue is visible
  useEffect(() => {
    if (!isActive) return;
    const id = setTimeout(scrollToNowPlaying, 50);
    return () => clearTimeout(id);
  }, [currentQueueItemId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Group switch — queue reloads async so use a longer delay
  useEffect(() => {
    if (!isActive) return;
    const id = setTimeout(scrollToNowPlaying, 400);
    return () => clearTimeout(id);
  }, [groupName]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isActive) return;
    async function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (selected.size === 0) return;
      e.preventDefault();
      const indices = [...selected];
      setItems(prev => prev.filter((_, i) => !selected.has(i)));
      setSelected(new Set());
      await getActiveProvider().removeFromQueue(indices).catch(() => { onRefresh(); onError('Failed to remove track'); });
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isActive, selected, setItems, onRefresh, onError]);

  function handleResizePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = liveWidthRef.current;
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    document.documentElement.classList.add('resizingQueue');

    const max = () => window.innerWidth - (PLAYER_BAR_W + PLAYER_BAR_PADDING);

    const onMove = (ev: PointerEvent) => {
      const next = Math.max(MIN_DOCKED_WIDTH, Math.min(max(), startWidth + (startX - ev.clientX)));
      setLiveWidth(next);
      onResizeWidthLive?.(next);
    };
    const onUp = () => {
      document.documentElement.classList.remove('resizingQueue');
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      onResizeWidth?.(liveWidthRef.current);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  }

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
    createDragGhost(toMove.size > 1 ? `${toMove.size} tracks` : (items[index]?.track.title ?? ''), e.dataTransfer);
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
    const listJson = e.dataTransfer.getData('application/sonos-item-list');
    if (listJson) {
      setDragOverIndex(null);
      let droppedItems: SonosItem[];
      try { droppedItems = JSON.parse(listJson) as SonosItem[]; } catch { return; }
      const pos = dragOverIndex >= items.length ? -1 : dragOverIndex;
      for (let idx = 0; idx < droppedItems.length; idx++) {
        await onAddToQueue(droppedItems[idx], pos === -1 ? -1 : pos + idx);
      }
      return;
    }
    const raw = e.dataTransfer.getData('application/queue-indices');
    if (!raw) { setDragOverIndex(null); return; }
    let fromIndices: number[];
    try { fromIndices = JSON.parse(raw) as number[]; } catch { setDragOverIndex(null); return; }
    const currentLength = items.length;
    const targetIndex = dragOverIndex;
    setDragOverIndex(null);
    setSelected(new Set());
    setItems(applyReorderLocally(items, fromIndices, targetIndex));
    await getActiveProvider().reorderQueue(fromIndices, targetIndex, currentLength).catch(() => { onRefresh(); onError('Failed to reorder queue'); });
  }

  function handleDragEnd() {
    setDragOverIndex(null);
    draggingSet.current = new Set();
  }

  function handleContentClick() {
    setSelected(new Set());
    lastSelected.current = null;
  }

  const selCount = selected.size;
  const sidebarClass = styles.sidebar;
  const sidebarStyle = { width: liveWidth };

  return (
    <div className={sidebarClass} style={sidebarStyle}>
      <div
        className={styles.resizeHandle}
        onPointerDown={handleResizePointerDown}
        onPointerMove={e => e.currentTarget.style.setProperty('--mouse-y', `${e.nativeEvent.offsetY}px`)}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize queue"
      />
      <div className={styles.dockedTopBar}>
        <div className={styles.winPill}>
          <WindowControls />
        </div>
      </div>
      <div className={styles.header}>
        <span className={styles.title}>
          Queue{groupName ? ` · ${groupName}` : ''}{items.length > 0 ? ` · ${items.length}` : ''}
          {selCount > 0 && <span className={styles.selBadge}>{selCount} selected</span>}
        </span>
        {pendingClear ? (
          <div className={styles.clearConfirm}>
            <span>Clear all {items.length} tracks?</span>
            <button className={styles.confirmYes} onClick={async () => {
              setPendingClear(false);
              setItems([]);
              await getActiveProvider().clearQueue().catch(() => { onRefresh(); onError('Failed to clear queue'); });
            }}>Clear</button>
            <button className={styles.confirmNo} onClick={() => setPendingClear(false)}>Cancel</button>
          </div>
        ) : (
          <div className={styles.headerActions}>
            <button className={styles.iconBtn} onClick={onRefresh} title="Refresh">↺</button>
            <button className={styles.iconBtn} onClick={scrollToNowPlaying} title="Jump to now playing">⊙</button>
            {items.length > 0 && (
              <button className={styles.iconBtn} title="Clear queue" onClick={() => setPendingClear(true)}>⊘</button>
            )}
          </div>
        )}
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
              currentQueueItemId={currentQueueItemId}
              attribution={attributionMap[item.track.id ?? '']}
              isSelected={selected.has(i)}
              timeToPlay={timesToPlay[i]}
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
            const indices = [...selected];
            setItems(prev => prev.filter((_, i) => !selected.has(i)));
            setSelected(new Set());
            await getActiveProvider().removeFromQueue(indices).catch(() => { onRefresh(); onError('Failed to remove tracks'); });
          }}>
            Delete
          </button>
        </div>
      )}
    </div>
  );
});
