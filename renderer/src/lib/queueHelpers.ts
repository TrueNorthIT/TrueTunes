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
