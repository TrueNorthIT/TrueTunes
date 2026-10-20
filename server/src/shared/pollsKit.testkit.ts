/**
 * Test helpers for the weekly poll tests: a deterministic clock, a poll builder and an
 * in-memory PollStore that records every write (so P-3 can assert exactly what was written).
 */
import type { Poll } from './polls';
import type { PollStore } from './pollService';

/** Thursday 2026-10-22 12:00 UTC (13:00 BST). London week began Monday 2026-10-19. */
export const THU_2026_10_22 = Date.UTC(2026, 9, 22, 12, 0);

export type StoreCall =
  | { op: 'create'; poll: Poll }
  | { op: 'replace'; poll: Poll }
  | { op: 'remove'; id: string }
  | { op: 'incrementCount'; id: string; index: number };

export function poll(id: string, liveFrom: string | null, extra: Partial<Poll> = {}): Poll {
  return {
    id,
    question: `Question ${id}?`,
    choices: ['Yes', 'No'],
    counts: [0, 0],
    order: 0,
    liveFrom,
    ...extra,
  };
}

/** Polls in queue order with `order` set to the array index. */
export function queue(...polls: Poll[]): Poll[] {
  return polls.map((p, i) => ({ ...p, order: i }));
}

export class MemoryPollStore implements PollStore {
  readonly docs = new Map<string, Poll>();
  readonly calls: StoreCall[] = [];

  constructor(initial: Poll[] = []) {
    for (const p of initial) this.docs.set(p.id, structuredClone(p));
  }

  async list(): Promise<Poll[]> {
    return [...this.docs.values()].map((p) => structuredClone(p));
  }
  async read(id: string): Promise<Poll | undefined> {
    const p = this.docs.get(id);
    return p ? structuredClone(p) : undefined;
  }
  async create(poll: Poll): Promise<Poll> {
    this.calls.push({ op: 'create', poll: structuredClone(poll) });
    if (this.docs.has(poll.id)) throw Object.assign(new Error('Conflict'), { statusCode: 409 });
    this.docs.set(poll.id, structuredClone(poll));
    return structuredClone(poll);
  }
  async replace(poll: Poll): Promise<Poll> {
    this.calls.push({ op: 'replace', poll: structuredClone(poll) });
    if (!this.docs.has(poll.id)) throw Object.assign(new Error('Not found'), { statusCode: 404 });
    this.docs.set(poll.id, structuredClone(poll));
    return structuredClone(poll);
  }
  async remove(id: string): Promise<void> {
    this.calls.push({ op: 'remove', id });
    this.docs.delete(id);
  }
  async incrementCount(id: string, index: number): Promise<void> {
    this.calls.push({ op: 'incrementCount', id, index });
    const p = this.docs.get(id);
    if (!p) throw Object.assign(new Error('Not found'), { statusCode: 404 });
    p.counts[index] += 1;
  }

  writes(): StoreCall[] {
    return this.calls;
  }
  /** Queue in schedule order. */
  ordered(): Poll[] {
    return [...this.docs.values()].sort((a, b) => a.order - b.order);
  }
}

let seq = 0;
/** Deterministic ids: p1, p2, ... per call to makeIdGenerator(). */
export function makeIdGenerator(): () => string {
  seq = 0;
  return () => `p${++seq}`;
}
