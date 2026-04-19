/**
 * OfficePubSub — Azure Web PubSub + Blob Storage client for the "who queued
 * this?" attribution feature.
 *
 * Architecture:
 *  - On connect: calls the Azure Function to get a signed Web PubSub URL
 *    and a short-lived Blob SAS URL.
 *  - Blob (attribution.json): persistent map of {trackUri → {user, …}} so
 *    late joiners still see history from earlier in the day.
 *  - Web PubSub hub "office": real-time broadcast of queue events to all
 *    connected clients.
 *
 * Designed to fail silently — if PUBSUB_FUNCTION_URL is not set, or Azure
 * is unreachable, the app works exactly as without this feature.
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

function httpPut(rawUrl: string, body: string, headers: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = new URL(rawUrl);
    const mod = url.protocol === 'https:' ? https : http;
    const buf = Buffer.from(body, 'utf8');
    const req = mod.request(
      rawUrl,
      {
        method: 'PUT',
        headers: { ...headers, 'Content-Length': buf.length },
      },
      (res) => {
        res.resume(); // consume body
        if ((res.statusCode ?? 0) >= 400) {
          reject(new Error(`PUT ${rawUrl} → ${res.statusCode}`));
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
  private blobSasUrl: string | null = null;
  private functionUrl = '';
  private attributionMap: AttributionMap = {};
  private eventCbs: ((e: AttributionEvent) => void)[] = [];
  private username = '';
  private connected = false;

  /** Connect to Azure Web PubSub and load blob history. Returns initial map. */
  async connect(username: string, functionUrl: string): Promise<AttributionMap> {
    this.username = username;
    this.functionUrl = functionUrl.replace(/\/$/, '');

    // Get tokens from the Azure Function
    const url = `${this.functionUrl}/api/connect?username=${encodeURIComponent(username)}`;
    const raw = await httpPost(url);
    const { webPubSubUrl, blobSasUrl } = JSON.parse(raw.toString()) as {
      webPubSubUrl: string;
      blobSasUrl: string;
    };
    this.blobSasUrl = blobSasUrl;

    // Load history from blob
    const initialMap = await this.loadAttribution();

    // Open Web PubSub connection
    this.ws = new WebSocket(webPubSubUrl, SUBPROTOCOL);

    this.ws.on('open', () => {
      this.connected = true;
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
            this.attributionMap[event.uri] = {
              user: event.user,
              timestamp: event.timestamp,
              trackName: event.trackName,
              artist: event.artist,
            };
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
    });

    return initialMap;
  }

  /** Publish a "track queued" event and update blob storage. */
  async publishQueued(item: { uri: string; trackName: string; artist: string; artistId?: string; album?: string; albumId?: string; imageUrl?: string }): Promise<void> {
    if (!item.uri) return;

    const event: AttributionEvent = {
      type: 'queued',
      user: this.username,
      uri: item.uri,
      trackName: item.trackName,
      artist: item.artist,
      artistId: item.artistId,
      album: item.album,
      albumId: item.albumId,
      imageUrl: item.imageUrl,
      timestamp: Date.now(),
    };

    // Update local map immediately
    this.attributionMap[item.uri] = {
      user: event.user,
      timestamp: event.timestamp,
      trackName: event.trackName,
      artist: event.artist,
    };

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

    // Persist to blob (fire-and-forget, silent on error)
    this.saveAttribution().catch((err) => {
      console.warn('[pubsub] Blob write failed:', err.message);
    });

    // Log to Cosmos via Azure Function (fire-and-forget)
    if (this.functionUrl) {
      httpPostJson(`${this.functionUrl}/api/log-event`, event).catch((err) => {
        console.warn('[pubsub] Cosmos log failed:', err.message);
      });
    }
  }

  onEvent(cb: (e: AttributionEvent) => void): void {
    this.eventCbs.push(cb);
  }

  getMap(): AttributionMap {
    return { ...this.attributionMap };
  }

  /** Re-fetch attribution.json from blob and return the merged map. */
  async refresh(): Promise<AttributionMap> {
    return this.loadAttribution();
  }

  isConnected(): boolean {
    return this.connected;
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private async loadAttribution(): Promise<AttributionMap> {
    if (!this.blobSasUrl) return {};
    try {
      const buf = await httpGet(this.blobSasUrl);
      if (!buf.length) return {};
      const data = JSON.parse(buf.toString()) as AttributionMap;
      this.attributionMap = data;
      return data;
    } catch {
      return {};
    }
  }

  private async saveAttribution(): Promise<void> {
    if (!this.blobSasUrl) return;
    await httpPut(
      this.blobSasUrl,
      JSON.stringify(this.attributionMap),
      {
        'Content-Type': 'application/json',
        'x-ms-blob-type': 'BlockBlob',
      },
    );
  }

  private wsSend(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }
}

export const officePubSub = new OfficePubSub();
