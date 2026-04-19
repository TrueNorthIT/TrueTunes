import { describe, it, expect } from 'vitest';
import { applyReorderLocally } from '../queueHelpers';

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
