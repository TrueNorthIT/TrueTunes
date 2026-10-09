import { describe, expect, it, vi } from 'vitest';
import { computeReorderBatches, createQueueOps } from '../queueOps';
import type { ReorderBatch } from '../queueOps';
import type { SonosClient } from '../sonosClient';

/**
 * Apply batches the way the API does (and the way the algorithm models it): each PATCH moves the
 * contiguous run at `items` so it starts at `positions[0]` in the pre-move index space.
 */
function applyBatches(queue: number[], batches: ReorderBatch[]): number[] {
  let q = [...queue];
  for (const { items, positions } of batches) {
    const start = items[0];
    const len = items.length;
    const finalPos = positions[0];
    const run = q.slice(start, start + len);
    const rest = [...q.slice(0, start), ...q.slice(start + len)];
    const insertAt = finalPos <= start ? finalPos : finalPos - len;
    q = [...rest.slice(0, insertAt), ...run, ...rest.slice(insertAt)];
  }
  return q;
}

/** What the user asked for: pull `from` out and drop them (in order) before the first survivor at/after `toIndex`. */
function expectedOrder(n: number, from: number[], toIndex: number): number[] {
  const sel = new Set(from);
  const sorted = [...from].sort((a, b) => a - b);
  const rest = Array.from({ length: n }, (_, i) => i).filter((i) => !sel.has(i));
  let anchor = rest.length;
  for (let i = toIndex; i < n; i++) {
    if (!sel.has(i)) {
      anchor = rest.indexOf(i);
      break;
    }
  }
  return [...rest.slice(0, anchor), ...sorted, ...rest.slice(anchor)];
}

describe('computeReorderBatches', () => {
  it('returns no batches when the order is unchanged', () => {
    expect(computeReorderBatches([2], 2, 5)).toEqual([]);
    expect(computeReorderBatches([2], 3, 5)).toEqual([]); // dropping after itself is a no-op
    expect(computeReorderBatches([0, 1], 0, 4)).toEqual([]);
  });

  it('moves a single item earlier', () => {
    expect(computeReorderBatches([3], 0, 5)).toEqual([{ items: [3], positions: [0] }]);
  });

  it('moves a single item later', () => {
    const batches = computeReorderBatches([0], 4, 5);
    expect(applyBatches([0, 1, 2, 3, 4], batches)).toEqual([1, 2, 3, 0, 4]);
  });

  it('moves a contiguous run as one batch', () => {
    expect(computeReorderBatches([3, 4], 0, 6)).toEqual([{ items: [3, 4], positions: [0, 1] }]);
  });

  it('splits a non-contiguous selection into runs, one batch each', () => {
    const batches = computeReorderBatches([3, 4, 7], 0, 9);
    expect(batches).toHaveLength(2);
    expect(
      applyBatches(
        Array.from({ length: 9 }, (_, i) => i),
        batches
      )
    ).toEqual(expectedOrder(9, [3, 4, 7], 0));
  });

  it('appends to the end when toIndex is past the last item', () => {
    const batches = computeReorderBatches([1], 5, 5);
    expect(applyBatches([0, 1, 2, 3, 4], batches)).toEqual([0, 2, 3, 4, 1]);
  });

  it('treats the selection as order-independent', () => {
    expect(computeReorderBatches([7, 3, 4], 0, 9)).toEqual(computeReorderBatches([3, 4, 7], 0, 9));
  });

  it('never touches the input array', () => {
    const from = [5, 1];
    computeReorderBatches(from, 0, 6);
    expect(from).toEqual([5, 1]);
  });

  it('produces the requested order for every selection of a small queue (exhaustive)', () => {
    const n = 6;
    let checked = 0;
    for (let mask = 1; mask < 1 << n; mask++) {
      const from = Array.from({ length: n }, (_, i) => i).filter((i) => mask & (1 << i));
      for (let toIndex = 0; toIndex <= n; toIndex++) {
        const batches = computeReorderBatches(from, toIndex, n);
        const got = applyBatches(
          Array.from({ length: n }, (_, i) => i),
          batches
        );
        expect(got, `from=[${from}] to=${toIndex}`).toEqual(expectedOrder(n, from, toIndex));
        checked++;
      }
    }
    expect(checked).toBe(63 * 7);
  });

  it('holds for random selections of larger queues', () => {
    // Small deterministic LCG so failures reproduce.
    let seed = 12345;
    const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let t = 0; t < 300; t++) {
      const n = 2 + Math.floor(rand() * 30);
      const k = 1 + Math.floor(rand() * Math.min(n, 8));
      const from = [...new Set(Array.from({ length: k }, () => Math.floor(rand() * n)))];
      const toIndex = Math.floor(rand() * (n + 1));
      const got = applyBatches(
        Array.from({ length: n }, (_, i) => i),
        computeReorderBatches(from, toIndex, n)
      );
      expect(got, `n=${n} from=[${from}] to=${toIndex}`).toEqual(expectedOrder(n, from, toIndex));
    }
  });
});

function makeOps(fetchResults: Array<{ error?: string; data?: unknown }> = []) {
  const queue = [...fetchResults];
  const fetch = vi.fn(async () => queue.shift() ?? { data: null });
  const config = {} as { queueId?: string };
  const ops = createQueueOps({ client: { fetch } as unknown as SonosClient, config });
  return { ops, fetch, config };
}

describe('queue ops', () => {
  it('reorder validates its inputs and never calls the API on bad input', async () => {
    const { ops, fetch } = makeOps();
    expect(await ops.reorder([-1], 0, 5)).toEqual({ error: 'Invalid fromIndices' });
    expect(await ops.reorder('x' as never, 0, 5)).toEqual({ error: 'Invalid fromIndices' });
    expect(await ops.reorder([1], -1, 5)).toEqual({ error: 'Invalid toIndex' });
    expect(await ops.reorder([1], 0, 0)).toEqual({ error: 'Invalid queueLength' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reorder with an empty selection is a no-op success', async () => {
    const { ops, fetch } = makeOps();
    expect(await ops.reorder([], 0, 5)).toEqual({ ok: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reorder sends one PATCH per batch with comma-joined items and positions', async () => {
    const { ops, fetch } = makeOps();
    expect(await ops.reorder([3, 4], 0, 6)).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith({
      operationId: 'reorderQueueResources',
      query: { items: '3,4', positions: '0,1' },
    });
  });

  it('reorder stops at the first failing batch and returns its error', async () => {
    const { ops, fetch } = makeOps([{ data: null }, { error: '412 Precondition Failed' }, { data: null }]);
    const res = await ops.reorder([1, 4, 7], 0, 9);
    expect(res).toEqual({ error: '412 Precondition Failed' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('reorder is a successful no-op when nothing needs to move', async () => {
    const { ops, fetch } = makeOps();
    expect(await ops.reorder([2], 2, 5)).toEqual({ ok: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('remove sends the indices and validates them', async () => {
    const { ops, fetch } = makeOps();
    await ops.remove([2, 5]);
    expect(fetch).toHaveBeenCalledWith({ operationId: 'deleteQueueResources', query: { items: '2,5' } });
    expect(await ops.remove([-2])).toEqual({ error: 'Invalid indices' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('clear deletes with no items filter', async () => {
    const { ops, fetch } = makeOps();
    await ops.clear();
    expect(fetch).toHaveBeenCalledWith({ operationId: 'deleteQueueResources' });
  });

  it('setQueueId only accepts non-empty strings', () => {
    const { ops, config } = makeOps();
    ops.setQueueId('RINCON_X');
    expect(config.queueId).toBe('RINCON_X');
    ops.setQueueId('');
    ops.setQueueId(5 as never);
    expect(config.queueId).toBe('RINCON_X');
  });
});
