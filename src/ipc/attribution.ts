// Office attribution over Azure Web PubSub: who queued what.

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { officePubSub } from '../pubsub';
import * as telemetry from '../telemetry';
import { config, log, broadcastToRenderers, PUBSUB_FUNCTION_URL } from '../state';
import { entraIdToken } from './entra';

let pubsubInitialised = false;

/** Initialise Azure PubSub if a Function URL and display name are configured. */
export async function initPubSub(): Promise<void> {
  if (!PUBSUB_FUNCTION_URL || !config.displayName) return;
  if (pubsubInitialised) {
    // Disconnect cleanly before reconnecting (resets eventCbs too)
    officePubSub.disconnect();
    pubsubInitialised = false;
  }
  try {
    const initialMap = await officePubSub.connect(config.displayName, PUBSUB_FUNCTION_URL, entraIdToken);
    broadcastToRenderers('attribution:map', initialMap);
    officePubSub.onEvent((event) => {
      broadcastToRenderers('attribution:event', event);
    });
    pubsubInitialised = true;
    log('[pubsub] Connected as', config.displayName);
  } catch (err) {
    console.warn('[pubsub] Failed to connect:', (err as Error).message);
    telemetry.exception(err, { phase: 'pubsub_connect' });
  }
}

export function register(): void {
  ipcMain.handle(
    'pubsub:publishQueued',
    async (
      _: IpcMainInvokeEvent,
      item: {
        eventType: 'track' | 'album';
        uri: string;
        trackName: string;
        artist: string;
        artistId?: string;
        album?: string;
        albumId?: string;
        imageUrl?: string;
      }
    ) => {
      await officePubSub.publishQueued(item).catch(() => {
        /* silent */
      });
      // Broadcast the local user's own attribution back to renderers (noEcho means
      // the WS won't echo it back, so we push it manually).
      const event = {
        type: 'queued' as const,
        eventType: item.eventType,
        user: config.displayName ?? '',
        uri: item.uri,
        trackName: item.trackName,
        artist: item.artist,
        artistId: item.artistId,
        album: item.album,
        albumId: item.albumId,
        imageUrl: item.imageUrl,
        timestamp: Date.now(),
      };
      broadcastToRenderers('attribution:event', event);
    }
  );

  ipcMain.handle('attribution:refresh', async () => {
    try {
      const map = await officePubSub.refresh();
      broadcastToRenderers('attribution:map', map);
    } catch {
      /* silent — pubsub not configured */
    }
  });
}
