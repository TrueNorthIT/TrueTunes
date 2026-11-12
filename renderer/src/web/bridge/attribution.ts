// Office attribution ("who queued this?"). The map comes from /fn/attribution and the user's own queues are
// announced locally and logged. The live part, other people's events arriving as they happen and our own going out,
// is attributionSocket.ts (Web PubSub through the gateway): it hands events to `ingest`, and `publishQueued`
// broadcasts through it. If that socket is down, nothing here depends on it.

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

const MAX_TEXT = 500;
const FORBIDDEN_URIS = new Set(['__proto__', 'constructor', 'prototype']);
const OPTIONAL_TEXT = ['serviceId', 'accountId', 'artistId', 'album', 'albumId', 'imageUrl'] as const;

/**
 * An event from another client is untrusted: any signed-in colleague can send any frame. Returns a copy holding
 * only the known fields, strings capped at 500 characters, or null when it is not a usable queued event. A
 * well-formed desktop event passes through unchanged.
 */
export function cleanLiveEvent(raw: unknown): AttributionEvent | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const e = raw as Record<string, unknown>;
  const { type, eventType, uri, user, timestamp } = e;
  if (type !== 'queued' || typeof uri !== 'string' || !uri || uri.length > MAX_TEXT || FORBIDDEN_URIS.has(uri)) {
    return null;
  }
  if (typeof user !== 'string' || typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return null;
  if (eventType !== undefined && eventType !== 'track' && eventType !== 'album') return null;
  const text = (v: unknown): string | null | undefined =>
    v === undefined ? undefined : typeof v === 'string' ? v.slice(0, MAX_TEXT) : null;
  const trackName = text(e['trackName']) ?? '';
  const artist = text(e['artist']) ?? '';
  const extras: Record<string, string> = {};
  for (const key of OPTIONAL_TEXT) {
    const v = text(e[key]);
    if (v === null) return null;
    if (v !== undefined) extras[key] = v;
  }
  if (e['trackName'] !== undefined && typeof e['trackName'] !== 'string') return null;
  if (e['artist'] !== undefined && typeof e['artist'] !== 'string') return null;
  return {
    type,
    ...(eventType ? { eventType } : {}),
    user: user.slice(0, MAX_TEXT),
    uri,
    trackName,
    artist,
    ...extras,
    timestamp,
  };
}

export function createAttribution(
  fn: FnFetch,
  userName: () => string | undefined,
  /** Tells the office live (attributionSocket.ts); does nothing when there is no connection. */
  broadcast: (event: AttributionEvent) => void = () => {}
) {
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
    ingest(raw: AttributionEvent): void {
      const event = cleanLiveEvent(raw);
      if (!event) return;
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
        broadcast(logged);
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
