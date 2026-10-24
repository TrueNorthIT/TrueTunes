import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
} from 'react';
import { defaultRangeExtractor, useVirtualizer, type Range, type Virtualizer } from '@tanstack/react-virtual';
import { useQueries } from '@tanstack/react-query';
import { Loader2, Disc3, RotateCw, LocateFixed, ListX } from 'lucide-react';
import { applyReorderLocally, expandToAlbumBlock, projectPlayTimes } from '../../lib/queueHelpers';
import { usePlaybackPosition } from '../../hooks/playbackPosition';
import { reportTrackMeta } from '../../lib/trackMetaReporter';
import { createDragGhost } from '../../lib/dragHelpers';
import { getActiveProvider } from '../../providers';
import { useAttribution, resolveAttribution } from '../../hooks/useAttribution';
import { useUsers } from '../../hooks/useUsers';
import { trackQueryOptions } from '../../hooks/useTrackDetails';
import { DraggableQueueRow } from './DraggableQueueRow';
import { DjUpcomingRow } from './DjUpcomingRow';
import { WindowControls } from '../WindowControls';
import type { NormalizedQueueItem } from '../../types/provider';
import type { SonosItem } from '../../types/sonos';
import styles from '../../styles/QueueSidebar.module.css';
import { useQueueActions } from '../../hooks/useQueueActions';
import { useEditQueue } from '../../hooks/useQueue';

interface Props {
  items: NormalizedQueueItem[];
  groupId: string | null;
  isLoading: boolean;
  error: string | null;
  currentObjectId: string | null;
  currentQueueItemId: string | null;
  /** Audio is playing, so the current row's bars move. */
  isPlaying?: boolean;
  currentTrackDurationMs?: number;
  groupName: string | null;
  onRefresh: () => void;
  onError: (msg: string) => void;
  dockedWidth?: number;
  onResizeWidth?: (width: number) => void;
  onResizeWidthLive?: (width: number) => void;
  /** 'docked' = resizable sidebar pinned to the right; 'skinny' = full-width panel, no resize. */
  variant?: 'docked' | 'skinny';
  /** The signed-in display name, so DJ picks can say "You". */
  viewer?: string | null;
  /** DJ autoplay: what's coming once the queue runs dry. */
  autoplay?: {
    enabled: boolean;
    upcoming: DjTrack[];
    fillerUri: string | null;
    setEnabled: (on: boolean) => void;
  };
}

/** What the virtual list lays out: a section label or a queue row. */
type Entry = { key: string; kind: 'row'; index: number } | { key: string; kind: 'label'; text: string; count?: number };

// Starting heights; the real ones are measured as rows render (a .row is 40px art + 12px padding).
const ROW_ESTIMATE_PX = 52;
const LABEL_ESTIMATE_PX = 36;

export interface QueueSidebarHandle {
  scrollToNowPlaying: () => void;
}

const MIN_DOCKED_WIDTH = 280;
const PLAYER_BAR_W = 800; // matches .inner width in PlayerBar.module.css
const PLAYER_BAR_PADDING = 64; // 32px breathing room each side

export const QueueSidebar = forwardRef<QueueSidebarHandle, Props>(function QueueSidebar(
  {
    items,
    groupId,
    isLoading,
    error,
    currentObjectId,
    currentQueueItemId,
    isPlaying = false,
    currentTrackDurationMs = 0,
    groupName,
    onRefresh,
    onError,
    dockedWidth,
    onResizeWidth,
    onResizeWidthLive,
    variant = 'docked',
    autoplay,
    viewer,
  },
  ref
) {
  const isActive = true;
  const { addToQueue: onAddToQueue } = useQueueActions();
  const editQueue = useEditQueue(groupId);

  const contentRef = useRef<HTMLDivElement>(null);
  const attributionMap = useAttribution(onRefresh);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [pendingClear, setPendingClear] = useState(false);
  // Same query Home uses, so queuers' photos cost nothing extra.
  const { data: users } = useUsers(true, true);
  const imageByUser = useMemo(() => new Map((users ?? []).map((u) => [u.userId, u.imageUrl])), [users]);
  const lastSelected = useRef<number | null>(null);
  const draggingSet = useRef<Set<number>>(new Set());

  // One query per track id: a track queued twice would put the same ['track', id] key in useQueries twice,
  // which it warns about ("Duplicate Queries found") on every render. Results are mapped back per item.
  const uniqueTracks = [...new Map(items.map((item) => [item.track.id || '', item.track])).values()];
  const uniqueTrackResults = useQueries({
    queries: uniqueTracks.map((track) => ({
      ...trackQueryOptions(track.id || '', track.serviceId ?? '', track.accountId ?? ''),
      enabled: !!(track.id && track.serviceId && track.accountId),
    })),
  });
  const trackDetailsResults = useMemo(() => {
    const ids = [...new Set(items.map((item) => item.track.id || ''))]; // same order as uniqueTracks
    const byId = new Map(ids.map((id, i) => [id, uniqueTrackResults[i]]));
    return items.map((item) => byId.get(item.track.id || ''));
  }, [items, uniqueTrackResults]);

  // Album ids per item, resolved from useTrackDetails (the same data the queue row
  // uses to render the album link) with the raw NormalizedTrack value as fallback.
  // Sonos rarely embeds album info on raw queue rows so the resolved value is what
  // the "Select album" button must match against.
  const resolvedAlbumIds = useMemo<(string | null)[]>(
    () =>
      items.map((item, i) => {
        const fromDetails = trackDetailsResults[i]?.data?.albumId;
        return (fromDetails ?? item.track.albumId) || null;
      }),
    [items, trackDetailsResults]
  );

  // When the playing track ends, to the second. It is constant while the track plays (the tick moves position and
  // the clock together), so the queue re-renders on a seek, pause or resync, not every second.
  const trackEndsAtSec = usePlaybackPosition((p) => (p.durationMs > 0 ? Math.floor(p.trackEndsAtMs / 1000) : 0));

  const timesToPlay = useMemo(() => {
    if (!currentQueueItemId || currentTrackDurationMs <= 0 || trackEndsAtSec === 0) return [];
    return projectPlayTimes({
      nowMs: trackEndsAtSec * 1000,
      currentIdx: Number(currentQueueItemId) - 1,
      remainingMs: 0,
      durations: items.map((item, i) => trackDetailsResults[i]?.data?.durationMs || item.track.durationMs || undefined),
    });
  }, [items, currentQueueItemId, currentTrackDurationMs, trackDetailsResults, trackEndsAtSec]);

  // Feed the music stats with lengths we've already looked up anyway.
  useEffect(() => {
    items.forEach((item, i) => {
      const d = trackDetailsResults[i]?.data;
      if (d) reportTrackMeta({ uri: item.track.id, durationMs: d.durationMs, explicit: d.explicit });
    });
  }, [items, trackDetailsResults]);

  const [liveWidth, setLiveWidth] = useState<number>(dockedWidth ?? 380);
  useEffect(() => {
    if (typeof dockedWidth === 'number') setLiveWidth(dockedWidth);
  }, [dockedWidth]);
  const liveWidthRef = useRef(liveWidth);
  useEffect(() => {
    liveWidthRef.current = liveWidth;
  }, [liveWidth]);

  // Played / now playing / up next, from the live queue position. Without a position the list is flat.
  const playingIdx = currentQueueItemId !== null ? Number(currentQueueItemId) - 1 : -1;
  const grouped = playingIdx >= 0 && playingIdx < items.length;
  const isSkinny = variant === 'skinny';
  // Skinny docks its own Now playing card under the list, so the row here would show the track twice.
  const nowPlayingRow = !isSkinny;
  const showItems = !isLoading && !error;

  // One list, played tracks included (Joe prefers it to folding them away); the labels mark the sections.
  const { entries, entryOfRow } = useMemo(() => {
    const out: Entry[] = [];
    const entryOfRow: number[] = [];
    if (grouped && playingIdx > 0) out.push({ key: 'l-played', kind: 'label', text: 'Played', count: playingIdx });
    for (let i = 0; i < items.length; i++) {
      if (grouped && i === playingIdx && !nowPlayingRow) continue;
      if (grouped && i === playingIdx && nowPlayingRow) out.push({ key: 'l-now', kind: 'label', text: 'Now playing' });
      if (grouped && i === playingIdx + 1) {
        out.push({ key: 'l-next', kind: 'label', text: 'Up next', count: items.length - playingIdx - 1 });
      }
      entryOfRow[i] = out.length;
      out.push({ key: `r${i}`, kind: 'row', index: i });
    }
    return { entries: out, entryOfRow };
  }, [items.length, grouped, playingIdx, nowPlayingRow]);

  const virtualizerRef = useRef<Virtualizer<HTMLDivElement, Element> | null>(null);

  function scrollToNowPlaying(smooth = true) {
    const entry = grouped ? entryOfRow[playingIdx] : undefined;
    if (entry !== undefined) {
      virtualizerRef.current?.scrollToIndex(entry, { align: 'center', behavior: smooth ? 'smooth' : 'auto' });
      return;
    }
    contentRef.current
      ?.querySelector<HTMLElement>('[data-playing="true"]')
      ?.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
  }
  // The timers below fire later; they call whatever this render's scroll was, not the one they were made in.
  const scrollToNowRef = useRef(scrollToNowPlaying);
  useLayoutEffect(() => {
    scrollToNowRef.current = scrollToNowPlaying;
  });
  const jumpToNowPlaying = useCallback(() => scrollToNowRef.current(), []);

  useImperativeHandle(ref, () => ({ scrollToNowPlaying: jumpToNowPlaying }), [jumpToNowPlaying]);

  useEffect(() => {
    setSelected(new Set());
  }, [items]);

  useEffect(() => {
    if (!isActive) return;
    const id = setTimeout(jumpToNowPlaying, 50);
    return () => clearTimeout(id);
  }, [isActive, jumpToNowPlaying]);

  // Track change while queue is visible
  useEffect(() => {
    if (!isActive) return;
    const id = setTimeout(jumpToNowPlaying, 50);
    return () => clearTimeout(id);
  }, [currentQueueItemId, isActive, jumpToNowPlaying]);

  // Group switch — queue reloads async so use a longer delay
  useEffect(() => {
    if (!isActive) return;
    const id = setTimeout(jumpToNowPlaying, 400);
    return () => clearTimeout(id);
  }, [groupName, isActive, jumpToNowPlaying]);

  useEffect(() => {
    if (!isActive) return;
    async function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (selected.size === 0) return;
      e.preventDefault();
      const indices = [...selected];
      const undo = editQueue((prev) => prev.filter((_, i) => !selected.has(i)));
      setSelected(new Set());
      await getActiveProvider()
        .removeFromQueue(indices)
        .catch(() => {
          undo();
          onRefresh();
          onError('Failed to remove track');
        });
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isActive, selected, editQueue, onRefresh, onError]);

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

  function handleDragStart(index: number, e: React.DragEvent) {
    const toMove = selected.has(index) ? new Set(selected) : new Set([index]);
    if (!selected.has(index)) {
      setSelected(toMove);
      lastSelected.current = index;
    }
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
      try {
        droppedItems = JSON.parse(listJson) as SonosItem[];
      } catch {
        return;
      }
      const pos = dragOverIndex >= items.length ? -1 : dragOverIndex;
      for (let idx = 0; idx < droppedItems.length; idx++) {
        await onAddToQueue(droppedItems[idx], pos === -1 ? -1 : pos + idx);
      }
      return;
    }
    const raw = e.dataTransfer.getData('application/queue-indices');
    if (!raw) {
      setDragOverIndex(null);
      return;
    }
    let fromIndices: number[];
    try {
      fromIndices = JSON.parse(raw) as number[];
    } catch {
      setDragOverIndex(null);
      return;
    }
    const currentLength = items.length;
    const targetIndex = dragOverIndex;
    setDragOverIndex(null);
    setSelected(new Set());
    const undo = editQueue(applyReorderLocally(items, fromIndices, targetIndex));
    await getActiveProvider()
      .reorderQueue(fromIndices, targetIndex, currentLength)
      .catch(() => {
        undo();
        onRefresh();
        onError('Failed to reorder queue');
      });
  }

  const handleDragEnd = useCallback(() => {
    setDragOverIndex(null);
    draggingSet.current = new Set();
  }, []);

  // The handlers close over selection, items and the drop target, so they change every render. The rows are
  // memoised, so they get these stable wrappers, which call the latest handlers.
  const latest = useRef({ handleRowClick, handleDragStart, handleDragOver, handleDrop });
  useLayoutEffect(() => {
    latest.current = { handleRowClick, handleDragStart, handleDragOver, handleDrop };
  });
  const onRowClick = useCallback((i: number, e: React.MouseEvent) => latest.current.handleRowClick(i, e), []);
  const onRowDragStart = useCallback((i: number, e: React.DragEvent) => latest.current.handleDragStart(i, e), []);
  const onRowDragOver = useCallback((i: number, e: React.DragEvent) => latest.current.handleDragOver(i, e), []);
  const onRowDrop = useCallback((e: React.DragEvent) => latest.current.handleDrop(e), []);

  function handleContentClick() {
    setSelected(new Set());
    lastSelected.current = null;
  }

  const selCount = selected.size;
  const sidebarClass = isSkinny ? `${styles.sidebar} ${styles.skinny}` : styles.sidebar;
  const sidebarStyle = isSkinny ? undefined : { width: liveWidth };

  return (
    <div className={sidebarClass} style={sidebarStyle}>
      {!isSkinny && (
        <div
          className={styles.resizeHandle}
          onPointerDown={handleResizePointerDown}
          onPointerMove={(e) => e.currentTarget.style.setProperty('--mouse-y', `${e.nativeEvent.offsetY}px`)}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize queue"
        />
      )}
      <div className={styles.dockedTopBar}>
        <div className={styles.winPill}>
          <WindowControls />
        </div>
      </div>
      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <span className={styles.title}>
            Queue
            {items.length > 0 && (
              <span className={styles.count} aria-label={`${items.length} tracks`}>
                {items.length}
              </span>
            )}
            {selCount > 0 && <span className={styles.selBadge}>{selCount} selected</span>}
          </span>
          {groupName && <span className={styles.room}>{groupName}</span>}
        </div>
        {pendingClear ? (
          <div className={styles.clearConfirm}>
            <span>Clear all {items.length} tracks?</span>
            <button
              className={styles.confirmYes}
              onClick={async () => {
                setPendingClear(false);
                const undo = editQueue([]);
                await getActiveProvider()
                  .clearQueue()
                  .catch(() => {
                    undo();
                    onRefresh();
                    onError('Failed to clear queue');
                  });
              }}
            >
              Clear
            </button>
            <button className={styles.confirmNo} onClick={() => setPendingClear(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <div className={styles.headerActions}>
            <button className={styles.iconBtn} onClick={onRefresh} title="Refresh" aria-label="Refresh">
              <RotateCw size={15} />
            </button>
            {nowPlayingRow && (
              <button
                className={styles.iconBtn}
                onClick={jumpToNowPlaying}
                title="Jump to now playing"
                aria-label="Jump to now playing"
              >
                <LocateFixed size={15} />
              </button>
            )}
            {items.length > 0 && (
              <button
                className={styles.iconBtn}
                title="Clear queue"
                aria-label="Clear queue"
                onClick={() => setPendingClear(true)}
              >
                <ListX size={15} />
              </button>
            )}
          </div>
        )}
      </div>

      <div
        className={styles.content}
        ref={contentRef}
        onClick={handleContentClick}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = e.dataTransfer.types.includes('application/sonos-item-list') ? 'copy' : 'move';
          setDragOverIndex(items.length);
        }}
        onDragLeave={(e) => {
          if (!contentRef.current?.contains(e.relatedTarget as Node)) setDragOverIndex(null);
        }}
        onDrop={handleDrop}
      >
        {isLoading && (
          <div className={styles.msg}>
            <Loader2 size={18} className={styles.spinner} />
          </div>
        )}
        {error && <div className={styles.msg}>{error}</div>}
        {!isLoading && !error && items.length === 0 && <div className={styles.msg}>Queue is empty.</div>}
        {items.length === 0 && dragOverIndex === 0 && (
          <div className={styles.dropLine} style={{ position: 'relative' }} />
        )}
        {showItems && entries.length > 0 && (
          <VirtualRows
            entries={entries}
            entryOfRow={entryOfRow}
            scrollRef={contentRef}
            draggingSet={draggingSet}
            virtualizerRef={virtualizerRef}
            renderEntry={(entry) => {
              if (entry.kind === 'label') {
                return (
                  <div className={styles.groupLabel}>
                    {entry.text}
                    {entry.count !== undefined && (
                      <>
                        {' '}
                        <span className={styles.groupCount}>{entry.count}</span>
                      </>
                    )}
                  </div>
                );
              }
              const i = entry.index;
              const item = items[i];
              const attr = resolveAttribution(attributionMap, item.track);
              return (
                <>
                  {dragOverIndex === i && <div className={styles.dropLine} />}
                  {dragOverIndex === items.length && i === items.length - 1 && (
                    <div className={`${styles.dropLine} ${styles.dropLineEnd}`} />
                  )}
                  <DraggableQueueRow
                    item={item}
                    index={i}
                    currentObjectId={currentObjectId}
                    currentQueueItemId={currentQueueItemId}
                    attribution={attr}
                    attributionImageUrl={attr ? imageByUser.get(attr.user) : undefined}
                    isSelected={selected.has(i)}
                    played={grouped && i < playingIdx}
                    audioPlaying={isPlaying}
                    timeToPlay={timesToPlay[i]?.atMs}
                    timeEstimated={timesToPlay[i]?.estimated}
                    onRowClick={onRowClick}
                    onDragStart={onRowDragStart}
                    onDragOver={onRowDragOver}
                    onDrop={onRowDrop}
                    onDragEnd={handleDragEnd}
                  />
                </>
              );
            }}
          />
        )}

        {/* Always rendered, even with nothing queued up yet: it's the room's
            signal that the DJ exists and whether it's armed. Hiding it until
            picks arrive meant a failed poll looked identical to no feature. */}
        {autoplay && (
          <>
            <div className={styles.djBreak}>
              <span className={styles.djBreakLine} />
              <button
                className={styles.djBreakLabel}
                onClick={() => autoplay.setEnabled(!autoplay.enabled)}
                title={autoplay.enabled ? 'Stop the DJ filling the queue' : 'Let the DJ keep the music going'}
              >
                <Disc3 size={14} className={autoplay.enabled ? styles.djSpin : undefined} />
                {autoplay.enabled ? 'DJ takes over' : 'DJ paused'}
              </button>
              <span className={styles.djBreakLine} />
            </div>

            {autoplay.upcoming.length === 0 ? (
              // The picks show whether or not autoplay is armed — the label above
              // already says which — so an empty list means the DJ genuinely has
              // nothing, not that it's switched off.
              <div className={styles.djEmpty}>Nothing to suggest just yet.</div>
            ) : (
              autoplay.upcoming.map((track) => (
                <DjUpcomingRow key={track.uri} track={track} idle={!autoplay.enabled} viewer={viewer} />
              ))
            )}
          </>
        )}
      </div>

      {selCount > 0 && (
        <div className={styles.selBar}>
          <span>
            {selCount} track{selCount !== 1 ? 's' : ''} selected
          </span>
          <div className={styles.selActions}>
            {selCount === 1 &&
              (() => {
                const anchor = [...selected][0];
                const anchorTrack = items[anchor]?.track;
                if (!anchorTrack) return null;
                const block = expandToAlbumBlock(items.length, anchor, resolvedAlbumIds);
                // Hide the button when there's nothing to expand to — keeps the bar
                // from offering an action that would be a no-op (or that grabbed the
                // whole queue back when this had an artist fallback).
                if (block.size <= 1) return null;
                const resolvedAlbumName = trackDetailsResults[anchor]?.data?.albumName ?? anchorTrack.albumName;
                const tooltip = `Expand to all ${block.size} tracks from ${resolvedAlbumName ?? 'this album'} in sequence`;
                return (
                  <button
                    className={styles.selExpandBtn}
                    title={tooltip}
                    onClick={() => {
                      setSelected(block);
                      lastSelected.current = anchor;
                    }}
                  >
                    Select album
                  </button>
                );
              })()}
            <button
              className={styles.selDelBtn}
              onClick={async () => {
                const indices = [...selected];
                const undo = editQueue((prev) => prev.filter((_, i) => !selected.has(i)));
                setSelected(new Set());
                await getActiveProvider()
                  .removeFromQueue(indices)
                  .catch(() => {
                    undo();
                    onRefresh();
                    onError('Failed to remove tracks');
                  });
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

/**
 * The virtual window over the queue. It owns the virtualizer so a scroll re-renders only this and the rows that
 * entered the window, not the whole sidebar (whose per-track queries are costly to re-run on every scroll step).
 */
function VirtualRows({
  entries,
  entryOfRow,
  scrollRef,
  draggingSet,
  virtualizerRef,
  renderEntry,
}: {
  entries: Entry[];
  entryOfRow: number[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  draggingSet: React.RefObject<Set<number>>;
  virtualizerRef: React.RefObject<Virtualizer<HTMLDivElement, Element> | null>;
  renderEntry: (entry: Entry) => React.ReactNode;
}) {
  // A dragged row must stay mounted even if the list scrolls it out of view, or the browser never fires its dragend.
  const rangeExtractor = useCallback(
    (range: Range) => {
      const base = defaultRangeExtractor(range);
      const extra = [...draggingSet.current]
        .map((i) => entryOfRow[i])
        .filter((e) => e !== undefined && !base.includes(e));
      return extra.length ? [...base, ...extra].sort((a, b) => a - b) : base;
    },
    [entryOfRow, draggingSet]
  );
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (entries[i]?.kind === 'label' ? LABEL_ESTIMATE_PX : ROW_ESTIMATE_PX),
    getItemKey: (i) => entries[i]?.key ?? i,
    overscan: 8,
    rangeExtractor,
  });
  useLayoutEffect(() => {
    virtualizerRef.current = virtualizer;
    return () => {
      virtualizerRef.current = null;
    };
  }, [virtualizer, virtualizerRef]);

  return (
    <div className={styles.virtualList} style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((v) => {
        const entry = entries[v.index];
        if (!entry) return null;
        return (
          <div
            key={v.key}
            data-index={v.index}
            ref={virtualizer.measureElement}
            className={styles.virtualItem}
            style={{ transform: `translateY(${v.start}px)` }}
          >
            {renderEntry(entry)}
          </div>
        );
      })}
    </div>
  );
}
