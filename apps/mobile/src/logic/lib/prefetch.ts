// Pure helpers for warming data/art ahead of use (queue art, upcoming tracks).

export interface QueueLikeItem {
  track: { id: string; serviceId: string | null; accountId: string | null };
}

/** Index of the playing item: by objectId, else the 1-based queueItemId cursor, else 0. */
export function currentQueueIndex(
  items: QueueLikeItem[],
  currentObjectId: string | null,
  queueItemId: string | null,
): number {
  if (currentObjectId) {
    const byId = items.findIndex((i) => i.track.id === currentObjectId);
    if (byId >= 0) return byId;
  }
  const n = Number(queueItemId);
  if (Number.isInteger(n) && n >= 1 && n <= items.length) return n - 1;
  return 0;
}

/**
 * The items worth warming, in priority order: what plays next first (that is what the user will see
 * and tap soonest), then the tracks just behind, then the top of the list they scroll from.
 * De-duplicated, clamped to the queue, and skipping items that lack the ids a lookup needs.
 */
export function prefetchWindow<T extends QueueLikeItem>(items: T[], currentIndex: number, ahead = 8, behind = 2, head = 6): T[] {
  const order: number[] = [];
  const seen = new Set<number>();
  const push = (i: number) => {
    if (i >= 0 && i < items.length && !seen.has(i)) {
      seen.add(i);
      order.push(i);
    }
  };
  for (let i = currentIndex; i <= currentIndex + ahead; i++) push(i);
  for (let i = currentIndex - 1; i >= currentIndex - behind; i--) push(i);
  for (let i = 0; i < head; i++) push(i);
  return order.map((i) => items[i]).filter((it) => it.track.id && it.track.serviceId && it.track.accountId);
}

/** Run async tasks with a concurrency cap. Never rejects; a failing task is skipped. */
export async function runLimited<T>(tasks: Array<() => Promise<T>>, concurrency: number, isCancelled: () => boolean = () => false): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (!isCancelled()) {
      const i = next++;
      if (i >= tasks.length) return;
      try {
        await tasks[i]();
      } catch {
        /* best effort */
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, tasks.length)) }, worker));
}

/** A bounded "already requested" set, so a long session doesn't grow without limit. */
export function createSeen(max = 2000) {
  const seen = new Set<string>();
  return {
    /** True the first time a key is added, false if it was already present. */
    add(key: string): boolean {
      if (seen.has(key)) return false;
      if (seen.size >= max) seen.delete(seen.values().next().value as string);
      seen.add(key);
      return true;
    },
    has: (key: string) => seen.has(key),
    get size() {
      return seen.size;
    },
  };
}
