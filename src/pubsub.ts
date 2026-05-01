/**
 * OfficePubSub — Azure Web PubSub client for the "who queued this?" attribution feature.
 *
 * Architecture:
 *  - On connect: calls the Azure Function to get a signed Web PubSub URL, then
 *    loads the initial attribution map from Cosmos via /api/attribution.
 *  - Cosmos (events container): source of truth — every queued event is logged
 *    there; /api/attribution folds last-24h track events into {uri → attribution}.
 *  - Web PubSub hub "office": real-time broadcast of queue events to all connected
 *    clients so badges update instantly without waiting for a refresh.
 *
 * Designed to fail silently — if PUBSUB_FUNCTION_URL is not set, or Azure is
 * unreachable, the app works exactly as without this feature.
 */

import WebSocket from 'ws';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import type { AttributionMap, AttributionEvent } from './types';

const HUB          = 'office';
const SUBPROTOCOL  = 'json.webpubsub.azure.v1';

// ─── HTTP helpers (avoid depending on global fetch in main process) ───────────

function httpGet(rawUrl: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const url = new URL(rawUrl);
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.get(rawUrl, (res) => {
      if (res.statusCode === 404) { resolve(Buffer.alloc(0)); return; }
      if ((res.statusCode ?? 0) >= 400) {
        reject(new Error(`GET ${rawUrl} → ${res.statusCode}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
  });
}

function httpPostJson(rawUrl: string, payload: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(JSON.stringify(payload), 'utf8');
    const url = new URL(rawUrl);
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(
      rawUrl,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': buf.length } },
      (res) => {
        res.resume();
        if ((res.statusCode ?? 0) >= 400) {
          reject(new Error(`POST ${rawUrl} → ${res.statusCode}`));
        } else {
          resolve();
        }
      },
    );
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

function httpPost(rawUrl: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const url = new URL(rawUrl);
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(rawUrl, { method: 'POST' }, (res) => {
      if ((res.statusCode ?? 0) >= 400) {
        reject(new Error(`POST ${rawUrl} → ${res.statusCode}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.end();
  });
}

// ─── OfficePubSub ─────────────────────────────────────────────────────────────

export class OfficePubSub {
  private ws: WebSocket | null = null;
  private functionUrl = '';
  private attributionMap: AttributionMap = {};
  private eventCbs: ((e: AttributionEvent) => void)[] = [];
  private username = '';
  private connected = false;
  private intentionalClose = false;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;

  /** Connect to Azure Web PubSub and load attribution history from Cosmos. */
  async connect(username: string, functionUrl: string): Promise<AttributionMap> {
    this.username = username;
    this.functionUrl = functionUrl.replace(/\/$/, '');
    this.intentionalClose = false;

    const url = `${this.functionUrl}/api/connect?username=${encodeURIComponent(username)}`;
    const raw = await httpPost(url);
    const { webPubSubUrl } = JSON.parse(raw.toString()) as { webPubSubUrl: string; [k: string]: unknown };

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

    // Update local map immediately. Only track events back queue-row badges;
    // album events publish under the album URI (no queue row to match) so we
    // skip the map update to avoid a phantom badge for unrelated lookups.
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

  private openWebSocket(wsUrl: string): void {
    this.ws = new WebSocket(wsUrl, SUBPROTOCOL);

    this.ws.on('open', () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      this.wsSend({ type: 'joinGroup', group: HUB });
    });

    this.ws.on('message', (data: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(data.toString()) as {
          type: string;
          from?: string;
          group?: string;
          data?: AttributionEvent;
        };
        if (msg.type === 'message' && msg.from === 'group' && msg.group === HUB && msg.data) {
          const event = msg.data;
          if (event.type === 'queued' && event.uri) {
            // Only track events back queue-row badges; album events would
            // place a phantom badge under the album URI. Legacy events with
            // no eventType are treated as track-equivalent (existing behavior).
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
    });

    this.ws.on('error', (err) => {
      console.warn('[pubsub] WS error:', err.message);
    });

    this.ws.on('close', () => {
      this.connected = false;
      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 60_000);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.intentionalClose || !this.functionUrl) return;
      try {
        const url = `${this.functionUrl}/api/connect?username=${encodeURIComponent(this.username)}`;
        const raw = await httpPost(url);
        const { webPubSubUrl } = JSON.parse(raw.toString()) as { webPubSubUrl: string; [k: string]: unknown };
        this.openWebSocket(webPubSubUrl);
      } catch {
        this.scheduleReconnect();
      }
    }, delay);
  }

  private logEventWithRetry(event: AttributionEvent): void {
    const attempt = async (n: number): Promise<void> => {
      try {
        await httpPostJson(`${this.functionUrl}/api/log-event`, event);
      } catch (err) {
        if (n < 2) {
          setTimeout(() => void attempt(n + 1), 1000 * (n + 1));
        } else {
          console.warn('[pubsub] Cosmos log failed after retries:', (err as Error).message);
        }
      }
    };
    void attempt(0);
  }

  private async loadAttribution(): Promise<AttributionMap> {
    if (!this.functionUrl) return {};
    try {
      const buf = await httpGet(`${this.functionUrl}/api/attribution`);
      if (!buf.length) return {};
      const data = JSON.parse(buf.toString()) as AttributionMap;
      this.attributionMap = data;
      return data;
    } catch {
      return {};
    }
  }

  private wsSend(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }
}

export const officePubSub = new OfficePubSub();
