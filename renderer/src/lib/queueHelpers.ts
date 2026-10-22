export function applyReorderLocally<T>(items: T[], fromIndices: number[], toIndex: number): T[] {
  const selectedSet = new Set(fromIndices);
  const remaining = items.filter((_, i) => !selectedSet.has(i));
  const origNonSelected = items.flatMap((_, i) => (selectedSet.has(i) ? [] : [i]));
  const insertAt = origNonSelected.filter(i => i < toIndex).length;
  const movers = [...fromIndices].sort((a, b) => a - b).map(i => items[i]);
  return [...remaining.slice(0, insertAt), ...movers, ...remaining.slice(insertAt)];
}

// Returns the indices of the contiguous run of queue items that share the anchor's
// album id. Always includes the anchor. If the anchor has no resolved album id, or
// no adjacent neighbour matches, returns just the anchor (no artist fallback —
// matching by artist alone tends to grab the entire queue when every track has the
// same artist or empty/unresolved artist).
//
// `albumIds` is aligned to the queue items. Callers must supply the merged album id
// (e.g. NormalizedTrack values overlaid with whatever `useTrackDetails` resolved)
// because Sonos doesn't reliably embed album info on raw queue rows.
export function expandToAlbumBlock(
  itemCount: number,
  anchor: number,
  albumIds: (string | null)[],
): Set<number> {
  if (anchor < 0 || anchor >= itemCount) return new Set([anchor]);
  const anchorAlbum = albumIds[anchor];
  if (!anchorAlbum) return new Set([anchor]);

  const result = new Set<number>([anchor]);
  for (let i = anchor - 1; i >= 0; i--) {
    if (albumIds[i] !== anchorAlbum) break;
    result.add(i);
  }
  for (let i = anchor + 1; i < itemCount; i++) {
    if (albumIds[i] !== anchorAlbum) break;
    result.add(i);
  }
  return result;
}

// A typical track length, used when no upcoming durations are known yet.
export const FALLBACK_TRACK_MS = 3.5 * 60_000;

export interface ProjectedTime {
  atMs: number;
  // True once any track before this one had to be estimated, since its error
  // carries into every later start time.
  estimated: boolean;
}

// Projects the wall-clock time each upcoming queue item will start, aligned to the
// queue. Sonos queue rows rarely carry a duration and per-track lookups can fail or
// still be loading, so an unknown duration (undefined or 0) is estimated as the mean
// of the known upcoming durations rather than stopping the projection there.
export function projectPlayTimes({
  nowMs,
  currentIdx,
  remainingMs,
  durations,
}: {
  nowMs: number;
  currentIdx: number;
  remainingMs: number;
  durations: (number | undefined)[];
}): (ProjectedTime | undefined)[] {
  const result: (ProjectedTime | undefined)[] = new Array(durations.length).fill(undefined);
  if (currentIdx < 0 || currentIdx >= durations.length) return result;

  const known = durations.slice(currentIdx + 1).filter((d): d is number => !!d && d > 0);
  const estimateMs = known.length ? known.reduce((a, b) => a + b, 0) / known.length : FALLBACK_TRACK_MS;

  let acc = Math.max(0, remainingMs);
  let estimated = false;
  for (let i = currentIdx + 1; i < durations.length; i++) {
    result[i] = { atMs: nowMs + acc, estimated };
    const d = durations[i];
    if (d && d > 0) {
      acc += d;
    } else {
      acc += estimateMs;
      estimated = true;
    }
  }
  return result;
}
