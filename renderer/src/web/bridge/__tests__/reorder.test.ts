import { describe, it, expect, vi } from 'vitest';
import { computeReorderBatches, createQueueEdits } from '../reorder';

interface Batch {
  items: number[];
  positions: number[];
}

/** The queue after one PATCH: the run at `items` is lifted out and goes before the item that sat at `positions[0]` (counted before the lift). */
function applyBatch(queue: number[], { items, positions }: Batch): number[] {
  const len = items.length;
  const run = queue.slice(items[0], items[0] + len);
  const rest = [...queue.slice(0, items[0]), ...queue.slice(items[0] + len)];
  const at = positions[0] <= items[0] ? positions[0] : positions[0] - len;
  return [...rest.slice(0, at), ...run, ...rest.slice(at)];
}

const apply = (n: number, batches: Batch[]) =>
  batches.reduce(
    applyBatch,
    Array.from({ length: n }, (_, i) => i)
  );

/** What the user asked for: the selection, in order, goes before the first unselected item at or after `insertBefore`. */
function expected(n: number, from: number[], insertBefore: number): number[] {
  const sel = new Set(from);
  const rest = Array.from({ length: n }, (_, i) => i).filter((i) => !sel.has(i));
  const k = rest.filter((i) => i < insertBefore).length;
  return [...rest.slice(0, k), ...[...from].sort((a, b) => a - b), ...rest.slice(k)];
}

describe('computeReorderBatches', () => {
  it('moves one item earlier', () => {
    expect(computeReorderBatches([5], 2, 8)).toEqual([{ items: [5], positions: [2] }]);
  });

  it('moves one item later', () => {
    // before item 6 of 8: lands at final index 5, which the PATCH expresses as position 6
    expect(computeReorderBatches([1], 6, 8)).toEqual([{ items: [1], positions: [6] }]);
    expect(apply(8, computeReorderBatches([1], 6, 8))).toEqual([0, 2, 3, 4, 5, 1, 6, 7]);
  });

  it('moves a contiguous run as one batch', () => {
    expect(computeReorderBatches([3, 4, 5], 0, 8)).toEqual([{ items: [3, 4, 5], positions: [0, 1, 2] }]);
  });

  it('splits a non-contiguous selection into runs', () => {
    const batches = computeReorderBatches([3, 4, 7], 0, 9);
    expect(batches).toHaveLength(2);
    expect(apply(9, batches)).toEqual([3, 4, 7, 0, 1, 2, 5, 6, 8]);
  });

  it('does nothing when the selection is already there', () => {
    expect(computeReorderBatches([2], 2, 5)).toEqual([]);
    expect(computeReorderBatches([2], 3, 5)).toEqual([]);
    expect(computeReorderBatches([1, 2], 1, 5)).toEqual([]);
    expect(computeReorderBatches([3, 4], 5, 5)).toEqual([]);
  });

  it('moves to the end', () => {
    const batches = computeReorderBatches([0], 5, 5);
    expect(apply(5, batches)).toEqual([1, 2, 3, 4, 0]);
    expect(apply(6, computeReorderBatches([0, 1], 6, 6))).toEqual([2, 3, 4, 5, 0, 1]);
  });

  it('ignores the order the indices come in', () => {
    expect(computeReorderBatches([7, 3, 4], 0, 9)).toEqual(computeReorderBatches([3, 4, 7], 0, 9));
  });

  it('yields the requested order for many random selections', () => {
    // mulberry32: seeded, so a failure reproduces
    let seed = 12345;
    const rnd = (n: number) => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
    };
    for (let round = 0; round < 500; round++) {
      const n = 2 + rnd(14);
      const picked = new Set<number>();
      const count = 1 + rnd(Math.min(n, 6));
      while (picked.size < count) picked.add(rnd(n));
      const from = [...picked];
      const to = rnd(n + 1);
      const got = apply(n, computeReorderBatches(from, to, n));
      expect(got, `n=${n} from=[${from}] to=${to}`).toEqual(expected(n, from, to));
    }
  });
});

describe('queue edits', () => {
  const make = () => {
    const sonosFetch = vi.fn<(r: FetchRequest) => Promise<FetchResponse>>(() => Promise.resolve({ data: null }));
    return { sonosFetch, ...createQueueEdits(sonosFetch) };
  };

  it('reorderQueue patches each batch in turn', async () => {
    const { sonosFetch, reorderQueue } = make();
    expect(await reorderQueue([3, 4, 7], 0, 9)).toEqual({ ok: true });
    expect(sonosFetch.mock.calls.length).toBe(2);
    expect(sonosFetch.mock.calls[0][0]).toEqual({
      operationId: 'reorderQueueResources',
      query: { items: '3,4', positions: '0,1' },
    });
  });

  it('stops at the first batch that fails and returns its error', async () => {
    const { sonosFetch, reorderQueue } = make();
    sonosFetch.mockResolvedValueOnce({ data: null }).mockResolvedValueOnce({ error: '412 Precondition Failed' });
    expect(await reorderQueue([3, 7, 8], 0, 12)).toEqual({ error: '412 Precondition Failed' });
    expect(sonosFetch).toHaveBeenCalledTimes(2);
  });

  it('validates its input', async () => {
    const { sonosFetch, reorderQueue } = make();
    expect(await reorderQueue('x' as unknown as number[], 0, 5)).toEqual({ error: 'Invalid fromIndices' });
    expect(await reorderQueue([-1], 0, 5)).toEqual({ error: 'Invalid fromIndices' });
    expect(await reorderQueue([1], -1, 5)).toEqual({ error: 'Invalid toIndex' });
    expect(await reorderQueue([1], 0, 0)).toEqual({ error: 'Invalid queueLength' });
    expect(await reorderQueue([], 0, 5)).toEqual({ ok: true });
    expect(sonosFetch).not.toHaveBeenCalled();
  });

  it('removeFromQueue deletes the listed items', async () => {
    const { sonosFetch, removeFromQueue } = make();
    await removeFromQueue([2, 5]);
    expect(sonosFetch).toHaveBeenCalledWith({ operationId: 'deleteQueueResources', query: { items: '2,5' } });
    expect(await removeFromQueue([-2])).toEqual({ error: 'Invalid indices' });
    expect(await removeFromQueue(undefined as unknown as number[])).toEqual({ error: 'Invalid indices' });
  });

  it('clearQueue deletes everything', async () => {
    const { sonosFetch, clearQueue } = make();
    await clearQueue();
    expect(sonosFetch).toHaveBeenCalledWith({ operationId: 'deleteQueueResources' });
  });
});
