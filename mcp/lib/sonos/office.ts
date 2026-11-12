// The office Sonos system: one short-lived WebSocket per request for live state and playback commands,
// plus the BFF's REST endpoints for search and the queue. Mirrors src/sonos-ws.ts and src/ipc/sonos.ts.
//
// Subscribing to a group's playbackExtended or groupVolume answers with an empty `{}`; the state itself
// follows as a separate push (extendedPlaybackStatus / groupVolume) tagged with the groupId.

import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import {
  BASE_URL,
  PLATFORM_ACCOUNT_ID,
  PLATFORM_SERVICE_ID,
  SEARCH_ACCOUNT_ID,
  SEARCH_SERVICE_ID,
  UA,
  WS_PROTOCOL,
  WS_URL,
} from './constants';
import { SonosHttpError, sonosHttp } from './http';
import {
  findTicket,
  matchRoom,
  parsePlayback,
  parseQueueItem,
  parseSearch,
  queueItems,
  queueTotal,
  roomsFromDevices,
  type MusicRef,
  type NowPlaying,
  type QueueEntry,
  type Room,
  type SearchHit,
} from './parse';
import { env } from '../env';
import { errorText, log, since } from '../log';
import { DAY, kv } from '../store';

type Header = Record<string, unknown>;

const pushKey = (namespace: unknown, name: unknown, groupId: unknown) => `${namespace}:${name}:${groupId ?? ''}`;

class SonosSocket {
  private pending = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
  >();
  private pushWaiters = new Map<string, (payload: unknown) => void>();

  private constructor(private ws: WebSocket) {
    ws.on('message', (raw) => this.onMessage(raw.toString()));
    ws.on('error', (err) => log.warn('sonos-ws', 'socket error', { error: err.message }));
    ws.on('close', () => {
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(new Error('Sonos WebSocket closed'));
      }
      this.pending.clear();
    });
  }

  static async open(): Promise<SonosSocket> {
    const { data } = await sonosHttp('/api/mfe');
    const ticket = findTicket(data);
    if (!ticket) throw new Error('Sonos gave no WebSocket ticket');
    const ws = new WebSocket(`${WS_URL}?ticket=${ticket}`, [WS_PROTOCOL], {
      headers: { Origin: BASE_URL, 'User-Agent': UA },
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Sonos WebSocket did not open')), 10_000);
      ws.once('open', () => {
        clearTimeout(timer);
        resolve();
      });
      ws.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      ws.once('unexpected-response', (_req, res) => {
        clearTimeout(timer);
        reject(new Error(`Sonos WebSocket refused (${res.statusCode})`));
      });
    });
    return new SonosSocket(ws);
  }

  private onMessage(raw: string): void {
    let header: Header;
    let payload: unknown;
    try {
      [header, payload] = JSON.parse(raw) as [Header, unknown];
    } catch {
      return;
    }
    const corrId = header['corrId'] as string | undefined;
    const waiter = corrId ? this.pending.get(corrId) : undefined;
    if (corrId && waiter) {
      this.pending.delete(corrId);
      clearTimeout(waiter.timer);
      if (header['success'] === false) {
        const p = (payload ?? {}) as Record<string, unknown>;
        waiter.reject(new Error(`${p['errorCode'] ?? p['reason'] ?? 'failed'}`));
      } else {
        waiter.resolve(payload);
      }
    }
    const key = pushKey(header['namespace'], header['name'] ?? header['type'], header['groupId']);
    const push = this.pushWaiters.get(key);
    if (push) {
      this.pushWaiters.delete(key);
      push(payload);
    }
  }

  send(header: Header, payload: Record<string, unknown> = {}, timeoutMs = 10_000): Promise<unknown> {
    const started = Date.now();
    const what = `${header['namespace']}.${header['command']}`;
    const target = (header['groupId'] ?? header['playerId']) as string | undefined;
    return new Promise<unknown>((resolve, reject) => {
      if (this.ws.readyState !== WebSocket.OPEN) return reject(new Error('Sonos WebSocket is not open'));
      const corrId = randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(corrId);
        reject(new Error('no answer from Sonos'));
      }, timeoutMs);
      this.pending.set(corrId, { resolve, reject, timer });
      this.ws.send(JSON.stringify([{ ...header, corrId }, payload]));
    }).then(
      (result) => {
        if (header['command'] !== 'subscribe') log.info('sonos-ws', what, { ok: true, target, ms: since(started) });
        return result;
      },
      (err: Error) => {
        // A gone group (e.g. a stale Bathroom group) fails its subscribes on every connect; the
        // `connected` line already reports it as unreachable, so don't repeat that as a warning.
        if (!(header['command'] === 'subscribe' && err.message === 'ERROR_RESOURCE_GONE')) {
          log.warn('sonos-ws', what, { ok: false, target, error: err.message, ms: since(started) });
        }
        throw new Error(`Sonos ${what}: ${err.message}`);
      }
    );
  }

  /** Subscribes and resolves with the first `namespace:name` push for the same group (or household). */
  subscribeForPush(header: Header, name: string, timeoutMs = 8_000): Promise<unknown> {
    const key = pushKey(header['namespace'], name, header['groupId']);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pushWaiters.delete(key);
        reject(new Error(`no ${header['namespace']} status from Sonos`));
      }, timeoutMs);
      this.pushWaiters.set(key, (p) => {
        clearTimeout(timer);
        resolve(p);
      });
      this.send({ ...header, command: 'subscribe' }).catch((err: Error) => {
        clearTimeout(timer);
        this.pushWaiters.delete(key);
        reject(err);
      });
    });
  }

  close(): void {
    try {
      this.ws.close(1000);
    } catch {
      /* already closed */
    }
  }
}

export interface RoomState {
  room: Room;
  /** False when Sonos says the group is gone or doesn't answer. */
  available: boolean;
  playback: NowPlaying;
  volume?: number;
}

export class Office {
  private constructor(
    private sock: SonosSocket,
    public householdId: string,
    public rooms: RoomState[]
  ) {}

  /** Opens the socket and loads households, rooms, and each room's playback and volume. */
  static async connect(): Promise<Office> {
    const started = Date.now();
    const sock = await SonosSocket.open();
    try {
      const hh = (await sock.send(
        { namespace: 'households', command: 'getHouseholds' },
        { connectedOnly: 'true' }
      )) as {
        households?: Array<{ id: string }>;
      };
      const householdId = hh?.households?.[0]?.id;
      if (!householdId) throw new Error('No Sonos household is online');
      await kv().set('sonos:household', householdId, { ex: DAY });

      const devices = await sock.subscribeForPush({ namespace: 'devices', householdId }, 'devicesStatus');
      const rooms = roomsFromDevices(devices);
      const states: RoomState[] = await Promise.all(
        rooms.map(async (room) => {
          const [pb, vol] = await Promise.all([
            sock
              .subscribeForPush({ namespace: 'playbackExtended', groupId: room.id }, 'extendedPlaybackStatus')
              .catch((err: Error) => err),
            sock
              .subscribeForPush({ namespace: 'groupVolume', groupId: room.id }, 'groupVolume')
              .catch((err: Error) => err),
          ]);
          const available = !(pb instanceof Error);
          const volume = vol instanceof Error ? undefined : (vol as { volume?: unknown } | null)?.volume;
          return {
            room,
            available,
            playback: available ? parsePlayback(pb) : { state: 'unreachable' },
            volume: typeof volume === 'number' ? volume : undefined,
          };
        })
      );
      log.info('sonos', 'connected', {
        ms: since(started),
        rooms: states.map((s) => `${s.room.name}:${s.playback.state}`).join(','),
      });
      return new Office(sock, householdId, states);
    } catch (err) {
      sock.close();
      log.error('sonos', 'connect failed', { error: errorText(err), ms: since(started) });
      throw err;
    }
  }

  close(): void {
    this.sock.close();
  }

  /** The named room, else DEFAULT_ROOM, else whichever reachable room is playing, else the first reachable. */
  pick(wanted?: string): RoomState {
    const all = this.rooms.map((s) => s.room);
    for (const name of [wanted, env.defaultRoom()]) {
      const room = matchRoom(all, name);
      if (room) {
        const state = this.rooms.find((s) => s.room === room)!;
        if (state.available) return state;
        if (name === wanted) throw new Error(`${room.name} isn't reachable right now.`);
      } else if (name && name === wanted) {
        throw new Error(`No room or speaker called "${wanted}". Rooms: ${all.map((r) => r.name).join(', ')}`);
      }
    }
    const usable = this.rooms.filter((s) => s.available);
    if (!usable.length) throw new Error('No Sonos rooms are reachable right now');
    return usable.find((s) => s.playback.state === 'playing') ?? usable[0];
  }

  // ─── Playback (WebSocket) ──────────────────────────────────────────────────

  private playback(rs: RoomState, command: string, payload: Record<string, unknown> = {}) {
    return this.sock.send({ namespace: 'playback', groupId: rs.room.id, command }, payload);
  }

  play = (rs: RoomState) => this.playback(rs, 'play', { allowTvPauseRestore: true, deviceFeedback: 'NONE' });
  pause = (rs: RoomState) => this.playback(rs, 'pause', { allowTvPauseRestore: true, deviceFeedback: 'NONE' });
  next = (rs: RoomState) => this.playback(rs, 'skipToNextTrack');
  previous = (rs: RoomState) => this.playback(rs, 'skipBack');
  /** 1-based queue position. */
  skipTo = (rs: RoomState, trackNumber: number) => this.playback(rs, 'skipToTrack', { trackNumber });

  setVolume(rs: RoomState, volume: number) {
    return this.sock.send({ namespace: 'groupVolume', groupId: rs.room.id, command: 'setVolume' }, { volume });
  }

  /** Plays a clip over the music on every speaker in the room; Sonos ducks the music, then carries on. */
  async announce(rs: RoomState, streamUrl: string, volume: number): Promise<void> {
    const payload = {
      name: 'TrueTunes',
      appId: 'com.truetunes',
      clipType: 'CUSTOM',
      streamUrl,
      priority: 'LOW',
      volume,
    };
    await Promise.all(
      rs.room.players.map((p) =>
        this.sock.send({ namespace: 'audioClip', playerId: p.id, command: 'loadAudioClip' }, payload)
      )
    );
  }

  // ─── Queue (REST) ──────────────────────────────────────────────────────────

  private queuePath(rs: RoomState): string {
    const queueId = rs.playback.queueId ?? rs.room.coordinatorId;
    return (
      `/api/content/v1/groups/${encodeURIComponent(rs.room.id)}` +
      `/services/${PLATFORM_SERVICE_ID}/accounts/${PLATFORM_ACCOUNT_ID}` +
      `/queues/${encodeURIComponent(queueId)}/resources`
    );
  }

  async readQueue(rs: RoomState, max = 500): Promise<{ entries: QueueEntry[]; etag?: string }> {
    const entries: QueueEntry[] = [];
    let etag: string | undefined;
    for (let offset = 0; offset < max; offset += 50) {
      const page = await sonosHttp(this.queuePath(rs), { query: { count: 50, offset } });
      if (offset === 0) etag = page.etag;
      const items = queueItems(page.data);
      items.forEach((it, i) => entries.push(parseQueueItem(it, offset + i)));
      const total = queueTotal(page.data);
      if (items.length < 50 || (total !== undefined && entries.length >= total)) break;
    }
    // The queue's etag is its version; when the header is missing, the playback push carries the same value.
    return { entries, etag: etag ?? rs.playback.queueVersion };
  }

  /** position is 0-based, -1 appends. Retries once with a fresh etag if the queue moved underneath us. */
  async addToQueue(rs: RoomState, ref: MusicRef, position: number, etag?: string): Promise<void> {
    const body = { id: { objectId: ref.objectId, serviceId: ref.serviceId, accountId: ref.accountId }, type: ref.type };
    const add = (ifMatch?: string) =>
      sonosHttp(this.queuePath(rs), {
        method: 'POST',
        query: { position },
        headers: ifMatch ? { 'If-Match': ifMatch } : undefined,
        body,
      });
    try {
      await add(etag);
    } catch (err) {
      if (!(err instanceof SonosHttpError) || err.status >= 500) throw err;
      log.warn('sonos', 'queue add retry with fresh etag', { status: err.status });
      const fresh = await sonosHttp(this.queuePath(rs), { query: { count: 1, offset: 0 } });
      await add(fresh.etag);
    }
  }

  /** 0-based indices. */
  async removeFromQueue(rs: RoomState, indices: number[]): Promise<void> {
    await sonosHttp(this.queuePath(rs), { method: 'DELETE', query: { items: indices.join(',') } });
  }
}

export async function withOffice<T>(fn: (office: Office) => Promise<T>): Promise<T> {
  const office = await Office.connect();
  try {
    return await fn(office);
  } finally {
    office.close();
  }
}

async function householdId(): Promise<string> {
  return (await kv().get<string>('sonos:household')) ?? (await withOffice(async (o) => o.householdId));
}

/** YouTube Music search through Sonos, as the desktop app's search box does. */
export async function searchMusic(query: string, count = 10): Promise<SearchHit[]> {
  const hh = await householdId();
  const { data } = await sonosHttp(
    `/api/content/v1/households/${encodeURIComponent(hh)}/services/${SEARCH_SERVICE_ID}/accounts/${SEARCH_ACCOUNT_ID}/search`,
    { query: { query, count } }
  );
  return parseSearch(data);
}
