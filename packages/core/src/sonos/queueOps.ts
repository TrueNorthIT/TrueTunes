// Ported from TrueTunes/src/main.ts (computeReorderBatches + queue:reorder/remove/clear/setId).
//
// The API only accepts contiguous runs per PATCH (?items=0,1&positions=4,5). A non-contiguous
// selection (e.g. [3,4,7]) is split into runs ([3,4] and [7]) and each run is patched in sequence.
// After each patch the virtual queue changes, so subsequent runs' positions are recalculated
// against the updated state.
//
// Processing runs left-to-right works universally (moving earlier OR later): for each run we find
// its "pivot" - the item that should immediately precede the run in the desired final order - then
// look up that pivot's current position in the working array to derive finalPos.

import type { SonosClient } from './sonosClient';
import type { FetchResponse, SonosConfig } from './types';

export interface ReorderBatch {
  items: number[];
  positions: number[];
}

export function computeReorderBatches(
  fromIndices: number[],
  insertBefore: number,
  queueLength: number
): ReorderBatch[] {
  const sorted = [...fromIndices].sort((a, b) => a - b);

  // Group into contiguous runs (left-to-right)
  const runs: number[][] = [];
  let curr = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) curr.push(sorted[i]);
    else {
      runs.push(curr);
      curr = [sorted[i]];
    }
  }
  runs.push(curr);

  // Build the desired target order
  const selectedSet = new Set(sorted);
  const nonSelected: number[] = [];
  for (let i = 0; i < queueLength; i++) if (!selectedSet.has(i)) nonSelected.push(i);

  // Anchor = first non-selected item at-or-after insertBefore
  let anchorIdx = nonSelected.length; // default: append at end
  for (let i = insertBefore; i < queueLength; i++) {
    if (!selectedSet.has(i)) {
      anchorIdx = nonSelected.indexOf(i);
      break;
    }
  }
  const target = [...nonSelected.slice(0, anchorIdx), ...sorted, ...nonSelected.slice(anchorIdx)];

  // Early-exit if already in the desired order
  if (target.every((v, i) => v === i)) return [];

  const working: number[] = Array.from({ length: queueLength }, (_, i) => i);
  const batches: ReorderBatch[] = [];

  for (const run of runs) {
    const runLen = run.length;
    const currentStart = working.indexOf(run[0]);

    // Final position via the pivot item (what should immediately precede this run)
    const targetRunStart = target.indexOf(run[0]);
    let finalPos: number;
    if (targetRunStart === 0) {
      finalPos = 0;
    } else {
      const pivot = target[targetRunStart - 1];
      finalPos = working.indexOf(pivot) + 1;
    }

    if (currentStart === finalPos) continue; // run is already in place

    batches.push({
      items: Array.from({ length: runLen }, (_, i) => currentStart + i),
      positions: Array.from({ length: runLen }, (_, i) => finalPos + i),
    });

    // Apply the move to the working array so subsequent runs see the updated state
    const runContents = working.slice(currentStart, currentStart + runLen);
    const rest = [...working.slice(0, currentStart), ...working.slice(currentStart + runLen)];
    const insertAt = finalPos <= currentStart ? finalPos : finalPos - runLen;
    working.splice(0, working.length, ...rest.slice(0, insertAt), ...runContents, ...rest.slice(insertAt));
  }

  return batches;
}

const isIndexList = (v: unknown): v is number[] => Array.isArray(v) && v.every((i) => typeof i === 'number' && i >= 0);

export interface QueueOps {
  reorder(fromIndices: number[], toIndex: number, queueLength: number): Promise<FetchResponse | { ok: true }>;
  remove(indices: number[]): Promise<FetchResponse>;
  clear(): Promise<FetchResponse>;
  setQueueId(queueId: string): void;
}

export function createQueueOps(deps: {
  client: SonosClient;
  config: SonosConfig;
  log?: (...args: unknown[]) => void;
}): QueueOps {
  const log = deps.log ?? (() => {});
  const { client, config } = deps;

  return {
    async reorder(fromIndices, toIndex, queueLength) {
      if (!isIndexList(fromIndices)) return { error: 'Invalid fromIndices' };
      if (typeof toIndex !== 'number' || toIndex < 0) return { error: 'Invalid toIndex' };
      if (typeof queueLength !== 'number' || queueLength <= 0) return { error: 'Invalid queueLength' };
      log(`[queue] reorder: [${fromIndices.join(',')}] -> before ${toIndex} (n=${queueLength})`);
      if (!fromIndices.length) return { ok: true };

      const batches = computeReorderBatches(fromIndices, toIndex, queueLength);
      log(`[queue] reorder: ${batches.length} batch(es)`, JSON.stringify(batches));

      for (const batch of batches) {
        const result = await client.fetch({
          operationId: 'reorderQueueResources',
          query: { items: batch.items.join(','), positions: batch.positions.join(',') },
        });
        if (result.error) {
          log('[queue] reorder batch failed:', result.error);
          return result;
        }
      }
      return { ok: true };
    },

    async remove(indices) {
      if (!isIndexList(indices)) return { error: 'Invalid indices' };
      log(`[queue] remove: [${indices.join(',')}]`);
      return client.fetch({ operationId: 'deleteQueueResources', query: { items: indices.join(',') } });
    },

    async clear() {
      log('[queue] clear all');
      return client.fetch({ operationId: 'deleteQueueResources' });
    },

    setQueueId(queueId) {
      if (typeof queueId === 'string' && queueId) {
        config.queueId = queueId;
        log(`[queue] queueId synced: ${queueId}`);
      }
    },
  };
}
