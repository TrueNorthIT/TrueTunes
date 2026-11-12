// Office attribution ("who queued this?"). There is no Web PubSub connection in the browser for this release:
// the map comes from /fn/attribution and the user's own queues are announced locally. `ingest` is where a live
// event source plugs in later: hand it the events and the map and the listeners follow.

import { channel } from './events';
import type { FnFetch } from './functions';

interface QueuedItem {
  eventType: 'track' | 'album';
  uri: string;
  trackName: string;
  artist: string;
  serviceId?: string;
  accountId?: string;
  artistId?: string;
  album?: string;
  albumId?: string;
  imageUrl?: string;
}

/** What the server records: the renderer's AttributionEvent plus what the stats and the DJ read back. */
type QueuedEvent = AttributionEvent & Omit<QueuedItem, 'eventType' | 'uri' | 'trackName' | 'artist'>;

export function createAttribution(fn: FnFetch, userName: () => string | undefined) {
  let map: AttributionMap = {};
  const maps = channel<AttributionMap>();
  const events = channel<AttributionEvent>({ sticky: false });

  /** Only track events back queue-row badges; an album event would put a phantom badge under the album URI. */
  function record(event: AttributionEvent): void {
    if (event.type === 'queued' && event.uri && event.eventType !== 'album') {
      map[event.uri] = {
        user: event.user,
        timestamp: event.timestamp,
        trackName: event.trackName,
        artist: event.artist,
      };
      maps.remember({ ...map });
    }
  }

  /** The current map from Cosmos; {} when there is none or it cannot be reached. */
  async function load(): Promise<AttributionMap> {
    try {
      const res = await fn('attribution');
      if (!res.ok) return {};
      const data: AttributionMap = await res.json();
      map = { ...data };
      return data;
    } catch {
      return {};
    }
  }

  /** The durable record, with 3 attempts 1 s and 2 s apart. Fire and forget. */
  function logEvent(event: QueuedEvent): void {
    const attempt = async (n: number): Promise<void> => {
      try {
        const res = await fn('log-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(event),
        });
        if (!res.ok) throw new Error(`log-event ${res.status}`);
      } catch {
        if (n < 2) setTimeout(() => void attempt(n + 1), 1000 * (n + 1));
      }
    };
    void attempt(0);
  }

  return {
    onMap: (cb: (map: AttributionMap) => void) => maps.on(cb),
    onEvent: (cb: (event: AttributionEvent) => void) => events.on(cb),

    /** Loads the map and tells the listeners (start-up and refreshAttribution). */
    async refresh(): Promise<void> {
      maps.emit(await load());
    },

    /** An event from elsewhere (a live source): updates the map, then tells the listeners. */
    ingest(event: AttributionEvent): void {
      if (event.type !== 'queued' || !event.uri) return;
      record(event);
      events.emit(event);
    },

    async publishQueued(item: QueuedItem): Promise<void> {
      const user = userName() ?? '';
      if (item.uri) {
        const logged: QueuedEvent = {
          type: 'queued',
          eventType: item.eventType,
          user,
          uri: item.uri,
          trackName: item.trackName,
          artist: item.artist,
          serviceId: item.serviceId,
          accountId: item.accountId,
          artistId: item.artistId,
          album: item.album,
          albumId: item.albumId,
          imageUrl: item.imageUrl,
          timestamp: Date.now(),
        };
        record(logged);
        logEvent(logged);
      }
      // The user's own attribution goes back to the listeners at once; nothing would echo it.
      const local: QueuedEvent = {
        type: 'queued',
        eventType: item.eventType,
        user,
        uri: item.uri,
        trackName: item.trackName,
        artist: item.artist,
        artistId: item.artistId,
        album: item.album,
        albumId: item.albumId,
        imageUrl: item.imageUrl,
        timestamp: Date.now(),
      };
      events.emit(local);
    },
  };
}
