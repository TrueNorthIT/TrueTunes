// Sonos control: the BFF fetch bridge, WS playback/volume commands, the queue and group selection.

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import WebSocket from 'ws';
import type { FetchRequest, FetchResponse } from '../types';
import * as smtc from '../smtc';
import { config, log, saveConfig } from '../state';
import { sonosFetch } from '../sonos-api';
import { ws, wsSend, discoveredGroups, resyncRendererState } from '../sonos-ws';

// ─── Queue reorder algorithm ──────────────────────────────────────────────────
//
// The API only accepts contiguous runs per PATCH (?items=0,1&positions=4,5).
// A non-contiguous selection (e.g. [3,4,7]) is split into runs ([3,4] and [7])
// and each run is patched in sequence. After each patch the virtual queue
// changes, so subsequent runs' positions are recalculated against the updated
// state.
//
// Processing runs left-to-right works universally (moving earlier OR later):
// for each run we find its "pivot" — the item that should immediately precede
// the run in the desired final order — then look up that pivot's current
// position in the working array to derive finalPos.

interface ReorderBatch {
  items: number[];
  positions: number[];
}

function computeReorderBatches(fromIndices: number[], insertBefore: number, queueLength: number): ReorderBatch[] {
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

    // Find final position via the pivot item (what should immediately precede this run)
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

export function register(): void {
  ipcMain.handle('api:fetch', async (_event: IpcMainInvokeEvent, request: FetchRequest): Promise<FetchResponse> => {
    return sonosFetch(request);
  });

  ipcMain.handle('volume:group:set', (_event: IpcMainInvokeEvent, volume: number) => {
    if (typeof volume !== 'number' || volume < 0 || volume > 100) return { error: 'Invalid volume' };
    const groupId = config.groupId;
    if (!groupId) return { error: 'No active group' };
    if (!ws || ws.readyState !== WebSocket.OPEN) return { error: 'WS not connected' };
    return wsSend({ namespace: 'groupVolume', groupId, command: 'setVolume' }, { volume });
  });

  ipcMain.handle('playback:play', (_event: IpcMainInvokeEvent) => {
    const groupId = config.groupId;
    if (!ws || ws.readyState !== WebSocket.OPEN) return { error: 'WS not connected' };
    return wsSend(
      { namespace: 'playback', groupId, command: 'play' },
      { allowTvPauseRestore: true, deviceFeedback: 'NONE' }
    );
  });

  ipcMain.handle('playback:pause', (_event: IpcMainInvokeEvent) => {
    const groupId = config.groupId;
    if (!ws || ws.readyState !== WebSocket.OPEN) return { error: 'WS not connected' };
    return wsSend(
      { namespace: 'playback', groupId, command: 'pause' },
      { allowTvPauseRestore: true, deviceFeedback: 'NONE' }
    );
  });

  ipcMain.handle(
    'smtc:update',
    (_event: IpcMainInvokeEvent, data: { title?: string; artist?: string; album?: string; artworkUrl?: string }) => {
      smtc.setMetadata({
        title: data.title,
        artist: data.artist,
        album: data.album,
        thumbnailUrl: data.artworkUrl,
      });
    }
  );

  ipcMain.handle('playback:loadContent', (_event: IpcMainInvokeEvent, payload: Record<string, unknown>) => {
    const groupId = config.groupId;
    if (!ws || ws.readyState !== WebSocket.OPEN) return { error: 'WS not connected' };
    return wsSend({ namespace: 'playback', groupId, command: 'loadContent' }, payload);
  });

  ipcMain.handle('playback:refresh', (_event: IpcMainInvokeEvent) => {
    const groupId = config.groupId;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    // Re-subscribing triggers Sonos to push the current playbackExtended state immediately
    wsSend({ namespace: 'playbackExtended', groupId, command: 'subscribe' }, {}).catch(() => {});
  });

  ipcMain.handle('ws:resync', (_event: IpcMainInvokeEvent) => {
    resyncRendererState();
  });

  ipcMain.handle('playback:setPlayModes', (_event: IpcMainInvokeEvent, playModes: Record<string, unknown>) => {
    const groupId = config.groupId;
    if (!ws || ws.readyState !== WebSocket.OPEN) return { error: 'WS not connected' };
    return wsSend({ namespace: 'playback', groupId, command: 'setPlayModes' }, { playModes });
  });

  ipcMain.handle('playback:skipNext', (_event: IpcMainInvokeEvent) => {
    const groupId = config.groupId;
    if (!ws || ws.readyState !== WebSocket.OPEN) return { error: 'WS not connected' };
    return wsSend({ namespace: 'playback', groupId, command: 'skipToNextTrack' }, {});
  });

  ipcMain.handle('playback:skipPrev', (_event: IpcMainInvokeEvent) => {
    const groupId = config.groupId;
    if (!ws || ws.readyState !== WebSocket.OPEN) return { error: 'WS not connected' };
    return wsSend({ namespace: 'playback', groupId, command: 'skipBack' }, {});
  });

  ipcMain.handle('playback:skipToTrack', (_event: IpcMainInvokeEvent, trackNumber: number) => {
    const groupId = config.groupId;
    if (!ws || ws.readyState !== WebSocket.OPEN) return { error: 'WS not connected' };
    return wsSend({ namespace: 'playback', groupId, command: 'skipToTrack' }, { trackNumber });
  });

  ipcMain.handle('playback:seek', (_event: IpcMainInvokeEvent, positionMillis: number) => {
    const groupId = config.groupId;
    if (!ws || ws.readyState !== WebSocket.OPEN) return { error: 'WS not connected' };
    return wsSend({ namespace: 'playback', groupId, command: 'seek' }, { positionMillis });
  });

  ipcMain.handle(
    'queue:reorder',
    async (_event: IpcMainInvokeEvent, fromIndices: number[], toIndex: number, queueLength: number) => {
      if (!Array.isArray(fromIndices) || !fromIndices.every((i) => typeof i === 'number' && i >= 0))
        return { error: 'Invalid fromIndices' };
      if (typeof toIndex !== 'number' || toIndex < 0) return { error: 'Invalid toIndex' };
      if (typeof queueLength !== 'number' || queueLength <= 0) return { error: 'Invalid queueLength' };
      log(`[queue] reorder: [${fromIndices.join(',')}] → before ${toIndex} (n=${queueLength})`);
      if (!fromIndices.length) return { ok: true };

      const batches = computeReorderBatches(fromIndices, toIndex, queueLength);
      log(`[queue] reorder: ${batches.length} batch(es)`, JSON.stringify(batches));

      for (const batch of batches) {
        const result = await sonosFetch({
          operationId: 'reorderQueueResources',
          query: { items: batch.items.join(','), positions: batch.positions.join(',') },
        });
        if (result.error) {
          console.error('[queue] reorder batch failed:', result.error);
          return result;
        }
      }
      return { ok: true };
    }
  );

  ipcMain.handle('queue:remove', (_event: IpcMainInvokeEvent, indices: number[]) => {
    if (!Array.isArray(indices) || !indices.every((i) => typeof i === 'number' && i >= 0))
      return { error: 'Invalid indices' };
    log(`[queue] remove: [${indices.join(',')}]`);
    return sonosFetch({
      operationId: 'deleteQueueResources',
      query: { items: indices.join(',') },
    });
  });

  ipcMain.handle('queue:clear', (_event: IpcMainInvokeEvent) => {
    log('[queue] clear all');
    return sonosFetch({ operationId: 'deleteQueueResources' });
  });

  ipcMain.handle('queue:setId', (_event: IpcMainInvokeEvent, queueId: string) => {
    if (typeof queueId === 'string' && queueId) {
      config.queueId = queueId;
      log(`[queue] queueId synced: ${queueId}`);
    }
  });

  ipcMain.handle('group:getActive', () => config.preferredCoordinatorId ?? null);

  ipcMain.handle('group:set', (_event: IpcMainInvokeEvent, groupId: string) => {
    const group = discoveredGroups.find((g) => g.id === groupId);
    if (!group) return { error: `Unknown group: ${groupId}` };
    config.groupId = group.id;
    config.preferredCoordinatorId = group.coordinatorId;
    log(`[group] Switched to "${group.name}" — groupId: ${group.id}`);
    void saveConfig();
    // Re-subscribe to playbackExtended for the new group — Sonos responds with an
    // extendedPlaybackStatus push so the renderer immediately gets fresh now-playing state.
    if (ws && ws.readyState === WebSocket.OPEN) {
      wsSend(
        {
          namespace: 'playbackExtended',
          groupId: group.id,
          command: 'subscribe',
        },
        {}
      ).catch(() => {});
      // Re-subscribe to groupVolume too — handleWsMessage forwards the response
      // to the renderer, so the UI reflects the new group's volume immediately
      // rather than the previous group's last-known value.
      wsSend({ namespace: 'groupVolume', groupId: group.id, command: 'subscribe' }, {}).catch(() => {});
    }
    return { ok: true };
  });
}
