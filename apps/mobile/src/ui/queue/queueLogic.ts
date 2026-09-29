// Pure helpers for the Queue screen (no React Native imports so vitest can load them).
import { attributionContentKey } from '../../logic/hooks/useAttribution';
import { applyReorderLocally } from '../../logic/lib/queueHelpers';
import type { NormalizedQueueItem, NormalizedTrack } from '../../logic/types/provider';

/** Match attribution by objectId first, then title+artist content key (desktop resolveAttribution). */
export function resolveAttribution(
  map: Record<string, { user: string }>,
  track: Pick<NormalizedTrack, 'id' | 'title' | 'artist'>,
): { user: string } | undefined {
  const byId = map[track.id ?? ''];
  if (byId) return byId;
  const ck = attributionContentKey(track.title, track.artist);
  return ck ? map[ck] : undefined;
}

/** Desktop marks the playing row when Number(queueItemId) === index + 1, else falls back to objectId. */
export function isPlayingRow(
  index: number,
  trackId: string,
  queueItemId: string | null,
  currentObjectId: string | null,
): boolean {
  if (queueItemId !== null) return Number(queueItemId) === index + 1;
  return !!currentObjectId && trackId === currentObjectId;
}

/** skipToTrack takes a 1-based track number. */
export const trackNumberForIndex = (index: number) => index + 1;

/** Toggle membership, returning a new set. */
export function toggleSelected(selected: ReadonlySet<number>, index: number): Set<number> {
  const next = new Set(selected);
  if (next.has(index)) next.delete(index);
  else next.add(index);
  return next;
}

/** Toggle a track in multi-select; deselecting the last one exits select mode. */
export function toggleSelection(
  selected: ReadonlySet<number>,
  index: number,
): { selected: Set<number>; selectMode: boolean } {
  const next = toggleSelected(selected, index);
  return { selected: next, selectMode: next.size > 0 };
}

/**
 * DraggableFlatList reports the item's final position (`to`); the server API and
 * applyReorderLocally want the insert-before index in the ORIGINAL list.
 */
export function insertBeforeIndex(from: number, to: number): number {
  return to > from ? to + 1 : to;
}

/** Optimistic single-item reorder using the desktop math. Returns the new list and the API args. */
export function planSingleReorder<T>(items: T[], from: number, to: number) {
  const toIndex = insertBeforeIndex(from, to);
  return {
    next: applyReorderLocally(items, [from], toIndex),
    fromIndices: [from],
    toIndex,
    queueLength: items.length,
  };
}

/** Stable keys across reorders: track id plus occurrence count for duplicates. */
export function buildKeys(items: NormalizedQueueItem[]): string[] {
  const seen = new Map<string, number>();
  return items.map((it) => {
    const n = (seen.get(it.track.id) ?? 0) + 1;
    seen.set(it.track.id, n);
    return `${it.track.id}#${n}`;
  });
}

export function removeIndices<T>(items: T[], indices: ReadonlySet<number>): T[] {
  return items.filter((_, i) => !indices.has(i));
}

export function selectionLabel(count: number): string {
  return `${count} track${count === 1 ? '' : 's'} selected`;
}

export const djBreakLabel = (enabled: boolean) => (enabled ? 'DJ takes over' : 'DJ paused');

// ── Scroll-to-now-playing ───────────────────────────────────────────────────

/** Rows have a fixed height so scroll offsets are exact and don't shift when an "added by" line loads. */
export const ROW_HEIGHT = 72;

export type PlayingPosition = 'none' | 'visible' | 'above' | 'below';

/** Index of the playing row, or -1 when nothing in the list is playing. */
export function findPlayingIndex(
  items: ReadonlyArray<{ track: { id: string } }>,
  queueItemId: string | null,
  currentObjectId: string | null,
): number {
  return items.findIndex((it, i) => isPlayingRow(i, it.track.id, queueItemId, currentObjectId));
}

/** Where the playing row is relative to the visible window; 'above'/'below' mean fully off-screen. */
export function playingPosition(
  index: number,
  scrollY: number,
  viewHeight: number,
  rowHeight: number = ROW_HEIGHT,
): PlayingPosition {
  if (index < 0 || viewHeight <= 0) return 'none';
  const top = index * rowHeight;
  const bottom = top + rowHeight;
  if (bottom <= scrollY) return 'above';
  if (top >= scrollY + viewHeight) return 'below';
  return 'visible';
}

/** Scroll offset that puts the playing row near the top, with a row of context above it. */
export function scrollOffsetForPlaying(playingIndex: number, contextRows = 1, rowHeight: number = ROW_HEIGHT): number {
  return Math.max(0, playingIndex - contextRows) * rowHeight;
}

/** Follow the playing track only while the user hasn't scrolled away, and only when it actually moved. */
export function shouldAutoFollow(following: boolean, previousIndex: number, nextIndex: number): boolean {
  return following && nextIndex >= 0 && nextIndex !== previousIndex;
}
