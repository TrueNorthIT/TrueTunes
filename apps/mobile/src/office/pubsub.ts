/**
 * OfficePubSub — Azure Web PubSub client for the "who queued this?" attribution feature.
 * Ported from TrueTunes/src/pubsub.ts; Node ws/http/https/Buffer replaced by injected
 * fetch + a WebSocket-like factory so it runs in Node tests and in React Native.
 *
 * Cosmos (via /api/attribution) is the source of truth; Web PubSub hub "office"
 * broadcasts queue events in real time. Designed to fail silently.
 */

const HUB = 'office';
const SUBPROTOCOL = 'json.webpubsub.azure.v1';
const WS_OPEN = 1;

export interface AttributionEntry {
  user: string;
  timestamp: number;
  trackName: string;
  artist: string;
}

/** Keyed by track objectId / URI */
export type AttributionMap = Record<string, AttributionEntry>;

export type EventType = 'track' | 'album';

export interface AttributionEvent {
  type: 'queued';
  /** Distinguishes per-track events from album-rollup events. Absent on legacy events. */
  eventType?: EventType;
  user: string;
  uri: string;
  trackName: string;
  artist: string;
  serviceId?: string;
  accountId?: string;
  artistId?: string;
  album?: string;
  albumId?: string;
  imageUrl?: string;
  timestamp: number;
}

/** Minimal WebSocket surface (RN's global WebSocket satisfies it). readyState 1 = OPEN. */
export interface PubSubSocket {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((ev?: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onerror: ((ev: { message?: string }) => void) | null;
  onclose: ((ev?: unknown) => void) | null;
}

export interface PubSubDeps {
  createSocket: (url: string, protocol: string) => PubSubSocket;
  fetchImpl?: typeof fetch;
  log?: (...a: unknown[]) => void;
}

export class OfficePubSub {
  private ws: PubSubSocket | null = null;
  private functionUrl = '';
  private attributionMap: AttributionMap = {};
  private eventCbs: ((e: AttributionEvent) => void)[] = [];
  private username = '';
  private connected = false;
  private intentionalClose = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly createSocket: PubSubDeps['createSocket'];
  private readonly doFetch: typeof fetch;
  private readonly log: (...a: unknown[]) => void;

  constructor(deps: PubSubDeps) {
    this.createSocket = deps.createSocket;
    this.doFetch = deps.fetchImpl ?? ((...a) => fetch(...a));
    this.log = deps.log ?? ((...a) => console.warn(...a));
  }

  /** Connect to Azure Web PubSub and load attribution history from Cosmos. */
  async connect(username: string, functionUrl: string): Promise<AttributionMap> {
    this.username = username;
    this.functionUrl = functionUrl.replace(/\/$/, '');
    this.intentionalClose = false;

    const webPubSubUrl = await this.negotiate();
    const initialMap = await this.loadAttribution();

    this.openWebSocket(webPubSubUrl);

    return initialMap;
  }

  /** Publish a "track queued" event. Updates local map and broadcasts via WS. */
  async publishQueued(item: { eventType: 'track' | 'album'; uri: string; trackName: string; artist: string; serviceId?: string; accountId?: string; artistId?: string; album?: string; albumId?: string; imageUrl?: string }): Promise<void> {
    if (!item.uri) return;

    const event: AttributionEvent = {
      type: 'queued',
      eventType: item.eventType,
      user: this.username,
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

    // Only track events back queue-row badges; album events publish under the album
    // URI (no queue row to match) so skip the map update to avoid a phantom badge.
    if (item.eventType === 'track') {
      this.attributionMap[item.uri] = {
        user: event.user,
        timestamp: event.timestamp,
        trackName: event.trackName,
        artist: event.artist,
      };
    }

    // Broadcast via Web PubSub (noEcho: true — we already updated locally)
    if (this.connected) {
      this.wsSend({
        type: 'sendToGroup',
        group: HUB,
        data: event,
        dataType: 'json',
        noEcho: true,
      });
    }

    // Log to Cosmos via Azure Function (with retry) — this is the durable record
    if (this.functionUrl) {
      this.logEventWithRetry(event);
    }
  }

  onEvent(cb: (e: AttributionEvent) => void): void {
    this.eventCbs.push(cb);
  }

  getMap(): AttributionMap {
    return { ...this.attributionMap };
  }

  /** Re-query Cosmos for the latest attribution map. */
  async refresh(): Promise<AttributionMap> {
    return this.loadAttribution();
  }

  isConnected(): boolean {
    return this.connected;
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.eventCbs = [];
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  /** POST /api/connect → signed Web PubSub client URL. Throws on >= 400. */
  private async negotiate(): Promise<string> {
    const url = `${this.functionUrl}/api/connect?username=${encodeURIComponent(this.username)}`;
    const res = await this.doFetch(url, { method: 'POST' });
    if (res.status >= 400) throw new Error(`POST ${url} → ${res.status}`);
    const { webPubSubUrl } = JSON.parse(await res.text()) as { webPubSubUrl: string; [k: string]: unknown };
    return webPubSubUrl;
  }

  private openWebSocket(wsUrl: string): void {
    const ws = this.createSocket(wsUrl, SUBPROTOCOL);
    this.ws = ws;

    ws.onopen = () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      this.wsSend({ type: 'joinGroup', group: HUB });
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as {
          type: string;
          from?: string;
          group?: string;
          data?: AttributionEvent;
        };
        if (msg.type === 'message' && msg.from === 'group' && msg.group === HUB && msg.data) {
          const event = msg.data;
          if (event.type === 'queued' && event.uri) {
            // Album events would place a phantom badge under the album URI. Legacy
            // events with no eventType are treated as track-equivalent.
            if (event.eventType !== 'album') {
              this.attributionMap[event.uri] = {
                user: event.user,
                timestamp: event.timestamp,
                trackName: event.trackName,
                artist: event.artist,
              };
            }
            this.eventCbs.forEach((cb) => cb(event));
          }
        }
      } catch { /* ignore malformed messages */ }
    };

    ws.onerror = (err) => {
      this.log('[pubsub] WS error:', err?.message);
    };

    ws.onclose = () => {
      this.connected = false;
      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 60_000);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.intentionalClose || !this.functionUrl) return;
      try {
        this.openWebSocket(await this.negotiate());
      } catch {
        this.scheduleReconnect();
      }
    }, delay);
  }

  private logEventWithRetry(event: AttributionEvent): void {
    const url = `${this.functionUrl}/api/log-event`;
    const attempt = async (n: number): Promise<void> => {
      try {
        const res = await this.doFetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(event),
        });
        if (res.status >= 400) throw new Error(`POST ${url} → ${res.status}`);
      } catch (err) {
        if (n < 2) {
          setTimeout(() => void attempt(n + 1), 1000 * (n + 1));
        } else {
          this.log('[pubsub] Cosmos log failed after retries:', (err as Error).message);
        }
      }
    };
    void attempt(0);
  }

  private async loadAttribution(): Promise<AttributionMap> {
    if (!this.functionUrl) return {};
    try {
      const url = `${this.functionUrl}/api/attribution`;
      const res = await this.doFetch(url);
      if (res.status === 404) return {};
      if (res.status >= 400) throw new Error(`GET ${url} → ${res.status}`);
      const text = await res.text();
      if (!text.length) return {};
      const data = JSON.parse(text) as AttributionMap;
      this.attributionMap = data;
      return data;
    } catch {
      return {};
    }
  }

  private wsSend(msg: object): void {
    if (this.ws?.readyState === WS_OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }
}
