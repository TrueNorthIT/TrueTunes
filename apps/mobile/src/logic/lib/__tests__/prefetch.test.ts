import { describe, expect, it } from 'vitest';
import { createSeen, currentQueueIndex, prefetchWindow, runLimited } from '../prefetch';

const item = (n: number, ids = true) => ({ track: { id: `t${n}`, serviceId: ids ? 's' : null, accountId: ids ? 'a' : null } });
const queue = (n: number) => Array.from({ length: n }, (_, i) => item(i));

describe('currentQueueIndex', () => {
  it('prefers the objectId match', () => expect(currentQueueIndex(queue(10), 't6', '2')).toBe(6));
  it('falls back to the 1-based queueItemId cursor', () => expect(currentQueueIndex(queue(10), 'gone', '4')).toBe(3));
  it('ignores an out-of-range or junk cursor', () => {
    expect(currentQueueIndex(queue(3), null, '9')).toBe(0);
    expect(currentQueueIndex(queue(3), null, 'x')).toBe(0);
    expect(currentQueueIndex(queue(3), null, null)).toBe(0);
  });
});

describe('prefetchWindow', () => {
  it('orders: playing item and what follows, then just behind, then the head', () => {
    const w = prefetchWindow(queue(100), 50, 3, 2, 2).map((i) => i.track.id);
    expect(w).toEqual(['t50', 't51', 't52', 't53', 't49', 't48', 't0', 't1']);
  });
  it('clamps to the queue and never repeats an item', () => {
    const w = prefetchWindow(queue(5), 3, 30, 3, 12).map((i) => i.track.id);
    expect(w).toEqual(['t3', 't4', 't2', 't1', 't0']);
    expect(new Set(w).size).toBe(w.length);
  });
  it('skips items without ids and handles an empty queue', () => {
    const items = [item(0), item(1, false), item(2)];
    expect(prefetchWindow(items, 0).map((i) => i.track.id)).toEqual(['t0', 't2']);
    expect(prefetchWindow([], 0)).toEqual([]);
  });
});

describe('runLimited', () => {
  it('never exceeds the concurrency cap and runs everything', async () => {
    let active = 0;
    let peak = 0;
    let done = 0;
    const tasks = Array.from({ length: 12 }, () => async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 2));
      active--;
      done++;
    });
    await runLimited(tasks, 3);
    expect(done).toBe(12);
    expect(peak).toBeLessThanOrEqual(3);
  });
  it('carries on past a failing task', async () => {
    const ran: number[] = [];
    await runLimited([async () => { ran.push(1); }, async () => { throw new Error('x'); }, async () => { ran.push(3); }], 1);
    expect(ran).toEqual([1, 3]);
  });
  it('stops starting new work once cancelled', async () => {
    let cancelled = false;
    const ran: number[] = [];
    const tasks = Array.from({ length: 6 }, (_, i) => async () => { ran.push(i); if (i === 1) cancelled = true; });
    await runLimited(tasks, 1, () => cancelled);
    expect(ran).toEqual([0, 1]);
  });
  it('is a no-op for no tasks', async () => {
    await expect(runLimited([], 4)).resolves.toBeUndefined();
  });
});

describe('createSeen', () => {
  it('reports first-time adds only', () => {
    const s = createSeen();
    expect(s.add('a')).toBe(true);
    expect(s.add('a')).toBe(false);
    expect(s.has('a')).toBe(true);
  });
  it('evicts the oldest past the cap', () => {
    const s = createSeen(2);
    s.add('a'); s.add('b'); s.add('c');
    expect(s.size).toBe(2);
    expect(s.has('a')).toBe(false);
    expect(s.has('c')).toBe(true);
  });
});
