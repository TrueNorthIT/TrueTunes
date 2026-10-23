import { describe, it, expect } from 'vitest';
import { applyReorderLocally, expandToAlbumBlock, projectPlayTimes, positionAfterCurrent, FALLBACK_TRACK_MS } from '../queueHelpers';

// Using plain strings — applyReorderLocally is generic, no QueueItem needed here.
const items = ['A', 'B', 'C', 'D', 'E'];

describe('applyReorderLocally', () => {
  // ─── Single-item moves ────────────────────────────────────────────────────────

  it('moves item from start to end', () => {
    expect(applyReorderLocally(['A', 'B', 'C', 'D'], [0], 4)).toEqual(['B', 'C', 'D', 'A']);
  });

  it('moves item from end to start', () => {
    expect(applyReorderLocally(['A', 'B', 'C', 'D'], [3], 0)).toEqual(['D', 'A', 'B', 'C']);
  });

  it('moves item one step forward', () => {
    expect(applyReorderLocally(['A', 'B', 'C'], [0], 2)).toEqual(['B', 'A', 'C']);
  });

  it('moves item one step backward', () => {
    expect(applyReorderLocally(['A', 'B', 'C'], [2], 1)).toEqual(['A', 'C', 'B']);
  });

  it('is a no-op when toIndex is already directly after the item', () => {
    // Moving index 1 to position 2 (just after itself) — result unchanged
    expect(applyReorderLocally(['A', 'B', 'C'], [1], 2)).toEqual(['A', 'B', 'C']);
  });

  it('is a no-op when toIndex equals the item index', () => {
    expect(applyReorderLocally(['A', 'B', 'C'], [1], 1)).toEqual(['A', 'B', 'C']);
  });

  // ─── Multi-item moves ─────────────────────────────────────────────────────────

  it('moves two contiguous items to the end', () => {
    expect(applyReorderLocally(items, [1, 2], 5)).toEqual(['A', 'D', 'E', 'B', 'C']);
  });

  it('moves two contiguous items to the start', () => {
    expect(applyReorderLocally(items, [3, 4], 0)).toEqual(['D', 'E', 'A', 'B', 'C']);
  });

  it('moves non-contiguous items and preserves their relative order', () => {
    // Moving indices 0, 2, 4 (A, C, E) to position 3 (before D in the original).
    // Non-selected = [B, D]; only B has original index < 3 → insertAt = 1.
    // Result: [B] + [A, C, E] + [D] = [B, A, C, E, D]
    expect(applyReorderLocally(items, [0, 2, 4], 3)).toEqual(['B', 'A', 'C', 'E', 'D']);
  });

  it('moves non-contiguous items to position 0', () => {
    expect(applyReorderLocally(items, [1, 3], 0)).toEqual(['B', 'D', 'A', 'C', 'E']);
  });

  it('sorts fromIndices before moving — order of fromIndices array should not matter', () => {
    const forward  = applyReorderLocally(items, [0, 2], 4);
    const reversed = applyReorderLocally(items, [2, 0], 4);
    expect(forward).toEqual(reversed);
    expect(forward).toEqual(['B', 'D', 'A', 'C', 'E']);
  });

  // ─── Edge cases ───────────────────────────────────────────────────────────────

  it('handles a single-element list', () => {
    expect(applyReorderLocally(['X'], [0], 0)).toEqual(['X']);
    expect(applyReorderLocally(['X'], [0], 1)).toEqual(['X']);
  });

  it('handles moving all items (no-op)', () => {
    expect(applyReorderLocally(['A', 'B', 'C'], [0, 1, 2], 0)).toEqual(['A', 'B', 'C']);
  });

  it('toIndex at the very end equals length', () => {
    expect(applyReorderLocally(['A', 'B', 'C'], [0], 3)).toEqual(['B', 'C', 'A']);
  });
});

describe('expandToAlbumBlock', () => {
  it('selects a contiguous run of tracks sharing an albumId', () => {
    const albumIds = ['A', 'A', 'A', 'B'];
    expect([...expandToAlbumBlock(albumIds.length, 1, albumIds)].sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  it('stops at the boundary of a different album', () => {
    const albumIds = ['A', 'B', 'B', 'A'];
    expect([...expandToAlbumBlock(albumIds.length, 1, albumIds)].sort((a, b) => a - b)).toEqual([1, 2]);
  });

  it('returns just the anchor when anchor has no albumId (no artist fallback)', () => {
    const albumIds = [null, null, null];
    expect([...expandToAlbumBlock(albumIds.length, 0, albumIds)]).toEqual([0]);
  });

  it('returns just the anchor when an empty-string albumId is passed', () => {
    const albumIds = ['', '', ''];
    expect([...expandToAlbumBlock(albumIds.length, 0, albumIds)]).toEqual([0]);
  });

  it('returns just the anchor when neighbours have different albums', () => {
    const albumIds = ['A', 'B', 'C'];
    expect([...expandToAlbumBlock(albumIds.length, 1, albumIds)]).toEqual([1]);
  });

  it('handles anchor at the start of the list', () => {
    const albumIds = ['A', 'A', 'B'];
    expect([...expandToAlbumBlock(albumIds.length, 0, albumIds)].sort((a, b) => a - b)).toEqual([0, 1]);
  });

  it('handles anchor at the end of the list', () => {
    const albumIds = ['B', 'A', 'A'];
    expect([...expandToAlbumBlock(albumIds.length, 2, albumIds)].sort((a, b) => a - b)).toEqual([1, 2]);
  });

  it('returns just the anchor when anchor is out of bounds', () => {
    const albumIds = ['A'];
    expect([...expandToAlbumBlock(albumIds.length, 5, albumIds)]).toEqual([5]);
  });

  it('does not run away when missing-albumId neighbours sit between two same-album items', () => {
    // Regression: previous artist-fallback code could grab unmatched neighbours.
    // With a strict same-album-id match, a null between two A's stops expansion.
    const albumIds = ['A', null, 'A'];
    expect([...expandToAlbumBlock(albumIds.length, 0, albumIds)]).toEqual([0]);
  });
});

describe('projectPlayTimes', () => {
  const MIN = 60_000;
  const now = 1_000_000;

  it('accumulates known durations after the current track', () => {
    const r = projectPlayTimes({ nowMs: now, currentIdx: 0, remainingMs: 1 * MIN, durations: [3 * MIN, 4 * MIN, 5 * MIN, 2 * MIN] });
    expect(r[0]).toBeUndefined();
    expect(r[1]).toEqual({ atMs: now + 1 * MIN, estimated: false });
    expect(r[2]).toEqual({ atMs: now + 5 * MIN, estimated: false });
    expect(r[3]).toEqual({ atMs: now + 10 * MIN, estimated: false });
  });

  it('keeps projecting past a track with an unknown duration, using the average of known ones', () => {
    // Before the fix the projection stopped at the first unknown duration.
    const r = projectPlayTimes({ nowMs: now, currentIdx: 0, remainingMs: 0, durations: [3 * MIN, 2 * MIN, undefined, 4 * MIN, 3 * MIN] });
    expect(r[1]).toEqual({ atMs: now, estimated: false });
    expect(r[2]).toEqual({ atMs: now + 2 * MIN, estimated: false });
    // Unknown track is estimated at the mean of the known upcoming durations (2, 4, 3 → 3 min).
    expect(r[3]).toEqual({ atMs: now + 5 * MIN, estimated: true });
    expect(r[4]).toEqual({ atMs: now + 9 * MIN, estimated: true });
  });

  it('treats a zero duration as unknown', () => {
    const r = projectPlayTimes({ nowMs: now, currentIdx: 0, remainingMs: 0, durations: [3 * MIN, 0, 4 * MIN] });
    expect(r[2]).toEqual({ atMs: now + 4 * MIN, estimated: true });
  });

  it('falls back to a typical track length when no durations are known yet', () => {
    const r = projectPlayTimes({ nowMs: now, currentIdx: 0, remainingMs: 0, durations: [undefined, undefined, undefined] });
    expect(r[1]).toEqual({ atMs: now, estimated: false });
    expect(r[2]).toEqual({ atMs: now + FALLBACK_TRACK_MS, estimated: true });
  });

  it('projects every row of a long queue even when many durations are missing', () => {
    const durations = Array.from({ length: 150 }, (_, i) => (i % 7 === 3 ? undefined : 3 * MIN));
    const r = projectPlayTimes({ nowMs: now, currentIdx: 10, remainingMs: 0, durations });
    for (let i = 11; i < 150; i++) expect(r[i]).toBeDefined();
    for (let i = 1; i < 150 - 11; i++) expect(r[11 + i]!.atMs).toBeGreaterThan(r[10 + i]!.atMs);
  });

  it('returns nothing before the current track or when the current index is out of range', () => {
    expect(projectPlayTimes({ nowMs: now, currentIdx: 2, remainingMs: 0, durations: [MIN, MIN, MIN, MIN] }).slice(0, 3))
      .toEqual([undefined, undefined, undefined]);
    expect(projectPlayTimes({ nowMs: now, currentIdx: -1, remainingMs: 0, durations: [MIN, MIN] })).toEqual([undefined, undefined]);
  });
});

describe('positionAfterCurrent', () => {
  it('inserts straight after the playing track', () => {
    // Track 3 of 10 is playing (1-based), so the next slot is 0-based index 3.
    expect(positionAfterCurrent('3', 10)).toBe(3);
    expect(positionAfterCurrent('1', 10)).toBe(1);
  });

  it('appends when the playing track is the last one', () => {
    expect(positionAfterCurrent('10', 10)).toBe(-1);
  });

  it('appends when nothing is playing from the queue', () => {
    expect(positionAfterCurrent(null, 10)).toBe(-1);
    expect(positionAfterCurrent('', 10)).toBe(-1);
    expect(positionAfterCurrent('0', 10)).toBe(-1);
    expect(positionAfterCurrent('abc', 10)).toBe(-1);
  });
});
