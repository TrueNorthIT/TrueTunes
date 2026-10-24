/**
 * Shared helpers for the DJ auto-queue tests and the office-day simulation.
 * Compiled only into dist-test (excluded from the production build in
 * tsconfig.json); never import this from production code.
 */

import { buildDjSet, type DjTrack } from './dj';
import { decideAutoplay, emptySession, trackKey, type DjSession } from './autoplay';
import type { DocStore, StoredDoc } from './djDayLedger';
import {
  createDjAutoplayService,
  type AutoplayBody,
  type AutoplayResponse,
  type DjAutoplayDeps,
  type DjAutoplayService,
  type TimedEvent,
} from './djAutoplayService';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** 10:00 BST on Tuesday 20 October 2026 (09:00 UTC) — an ordinary BST working day. */
export const T0 = Date.UTC(2026, 9, 20, 9, 0, 0);

/** 00:00 BST on 20 October 2026 = 23:00 UTC the evening before. */
export const LONDON_MIDNIGHT_20_OCT = Date.UTC(2026, 9, 19, 23, 0, 0);

// ---------------------------------------------------------------------------
// Independent oracle for "which London day is this?" — deliberately does not
// use the production helper, so the simulation can judge it.
// ---------------------------------------------------------------------------
const londonFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
export function oracleLondonDay(ms: number): string {
  return londonFmt.format(new Date(ms));
}

// ---------------------------------------------------------------------------
// In-memory DocStore with real ETag semantics, plus fault injection.
// ---------------------------------------------------------------------------
export class MemoryDocStore implements DocStore {
  readonly docs = new Map<string, StoredDoc>();
  private seq = 0;
  reads = 0;
  creates = 0;
  replaces = 0;
  /** Return an Error to make that write reject (non-412/409 = outage). */
  failWrite?: (id: string) => Error | undefined;
  private barrier?: { size: number; timeoutMs: number; waiting: Array<() => void> };

  /**
   * Hold reads until `size` of them are in flight at once, then release them
   * together. This forces the worst-case interleaving — every racer reads the
   * state BEFORE anyone writes — so a check-then-set that is not conditional on
   * the ETag visibly double-books. Falls back to releasing after `timeoutMs` so a
   * lone retry never hangs the suite.
   */
  holdReadsUntil(size: number, timeoutMs = 60): void {
    this.barrier = { size, timeoutMs, waiting: [] };
  }
  releaseReads(): void {
    this.barrier = undefined;
  }

  private async gate(): Promise<void> {
    const b = this.barrier;
    if (!b) return;
    await new Promise<void>((resolve) => {
      let done = false;
      const release = () => {
        if (done) return;
        done = true;
        resolve();
      };
      b.waiting.push(release);
      if (b.waiting.length >= b.size) {
        const all = b.waiting.splice(0);
        all.forEach((r) => r());
      } else {
        setTimeout(() => {
          const i = b.waiting.indexOf(release);
          if (i >= 0) b.waiting.splice(i, 1);
          release();
        }, b.timeoutMs);
      }
    });
  }

  private static tick(): Promise<void> {
    return new Promise((r) => setImmediate(r));
  }

  async read<T extends StoredDoc>(id: string): Promise<T | undefined> {
    this.reads++;
    await this.gate();
    await MemoryDocStore.tick();
    const d = this.docs.get(id);
    return d ? (structuredClone(d) as T) : undefined;
  }

  async create<T extends StoredDoc>(doc: T): Promise<T> {
    await MemoryDocStore.tick();
    const fault = this.failWrite?.(doc.id);
    if (fault) throw fault;
    this.creates++;
    if (this.docs.has(doc.id)) throw Object.assign(new Error('Conflict'), { statusCode: 409 });
    const stored = { ...structuredClone(doc), _etag: `e${++this.seq}` };
    this.docs.set(doc.id, stored);
    return structuredClone(stored) as T;
  }

  async replace<T extends StoredDoc>(doc: T, etag: string): Promise<T> {
    await MemoryDocStore.tick();
    const fault = this.failWrite?.(doc.id);
    if (fault) throw fault;
    this.replaces++;
    const current = this.docs.get(doc.id);
    if (!current) throw Object.assign(new Error('Not found'), { statusCode: 404 });
    if (current._etag !== etag) {
      throw Object.assign(new Error('Precondition failed'), { statusCode: 412 });
    }
    const stored = { ...structuredClone(doc), _etag: `e${++this.seq}` };
    this.docs.set(doc.id, stored);
    return structuredClone(stored) as T;
  }

  get writes(): number {
    return this.creates + this.replaces;
  }
}

// ---------------------------------------------------------------------------
// Synthetic history
// ---------------------------------------------------------------------------
export interface Song {
  trackName: string;
  artist: string;
  uri: string;
}

export const USERS = ['Alex', 'Sam'];

/**
 * `artists` acts with `tracksPerArtist` songs each. Play counts fall with rank so
 * artist 0 / track 0 is the room's favourite. Both users play every act, so
 * least-misery scoring keeps every act eligible. Events are `ageDays` old unless
 * told otherwise.
 */
export function buildHistory(o: {
  now: number;
  artists: number;
  tracksPerArtist: number;
  ageDays?: number;
  users?: string[];
}): TimedEvent[] {
  const users = o.users ?? USERS;
  const age = (o.ageDays ?? 30) * DAY;
  const events: TimedEvent[] = [];
  let n = 0;
  for (let a = 0; a < o.artists; a++) {
    for (let t = 0; t < o.tracksPerArtist; t++) {
      // Artist 0 is a clear headliner, so the room's first pick stays put when a
      // single extra event is logged (ties would make "skip the favourite" flaky).
      const plays = ((o.artists - a) * 4 + (o.tracksPerArtist - t) + 2) * (a === 0 ? 6 : 1);
      for (let p = 0; p < plays; p++) {
        events.push({
          userId: users[n % users.length],
          eventType: 'track',
          trackName: `Track ${a}-${t}`,
          artist: `Artist ${a}`,
          uri: `uri:a${a}:t${t}`,
          artistId: `artistId:${a}`,
          serviceId: '72711',
          accountId: '13',
          timestamp: o.now - age - n * 1000,
        });
        n++;
      }
    }
  }
  return events;
}

export const songKey = (s: { trackName: string; artist: string }): string => trackKey(s.trackName, s.artist);

/** What today's DJ would put first, with no exclusions (uses the existing buildDjSet). */
export function djRanking(history: TimedEvent[], users: string[] = USERS): DjTrack[] {
  return buildDjSet(history, { users, limit: 400, perArtistMax: 400 }).tracks;
}

// ---------------------------------------------------------------------------
// Legacy coordinator: today's dj-autoplay.ts logic (commit a669b2c) behind the
// SAME interface as the new service, so the whole suite can be pointed at the
// current behaviour with DJ_IMPL=legacy to see which requirements it breaks.
// ---------------------------------------------------------------------------
const LEGACY_WINDOW_DAYS = 90;
const LEGACY_ACTIVE_HOURS = 4;
const LEGACY_CANDIDATE_POOL = 40;

export function createLegacyService(deps: DjAutoplayDeps): DjAutoplayService {
  return {
    async handle(body: AutoplayBody): Promise<AutoplayResponse> {
      const now = deps.now();
      const groupId = body.groupId as string;
      const clientId = body.clientId as string;
      const queueUris = Array.isArray(body.queueUris) ? body.queueUris : [];
      const queueKeys = Array.isArray(body.queueKeys) ? body.queueKeys : [];
      const nowPlayingIndex = typeof body.nowPlayingIndex === 'number' ? body.nowPlayingIndex : null;

      // The real handler runs a 90-day query on EVERY call.
      const events = (await deps.fetchHistory()).filter((e) => (e.timestamp ?? 0) >= now - LEGACY_WINDOW_DAYS * DAY);
      let users = body.users?.filter(Boolean) ?? [];
      if (users.length === 0) {
        const since = now - LEGACY_ACTIVE_HOURS * HOUR;
        users = [...new Set(events.filter((e) => (e.timestamp ?? 0) >= since && e.userId).map((e) => e.userId))];
      }
      const { tracks: candidates } = buildDjSet(events, {
        users,
        limit: LEGACY_CANDIDATE_POOL,
        excludeUris: queueUris,
        perArtistMax: 1,
      });

      let decision!: ReturnType<typeof decideAutoplay>;
      for (let attempt = 0; attempt < 4; attempt++) {
        const current = await deps.sessions.read<DjSession>(groupId);
        const updated = (() => {
          decision = decideAutoplay(
            current ?? emptySession(groupId),
            {
              clientId,
              queueUris,
              queueKeys,
              nowPlayingUri: body.nowPlayingUri ?? null,
              nowPlayingKey: body.nowPlayingKey ?? null,
              nowPlayingIndex,
              candidates,
              ...(body.setEnabled !== undefined ? { setEnabled: body.setEnabled } : {}),
            },
            now
          );
          return decision.session;
        })();
        try {
          if (current?._etag) await deps.sessions.replace(updated, current._etag);
          else await deps.sessions.create(updated);
          break;
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          if ((code === 412 || code === 409) && attempt < 3) continue;
          throw err;
        }
      }
      return {
        enabled: decision.session.enabled,
        leaseHeld: decision.leaseHeld,
        enqueue: decision.enqueue,
        upcoming: decision.upcoming,
        fillerUri: decision.fillerUri,
      };
    },
  };
}

/** `DJ_IMPL=legacy` points every service-level test at today's behaviour. */
export function createServiceUnderTest(
  deps: DjAutoplayDeps,
  impl: 'legacy' | 'service' | undefined = process.env['DJ_IMPL'] === 'legacy' ? 'legacy' : 'service'
): DjAutoplayService {
  return impl === 'legacy' ? createLegacyService(deps) : createDjAutoplayService(deps);
}

// ---------------------------------------------------------------------------
// World: the stores, the event database and a mutable clock behind one service.
// ---------------------------------------------------------------------------
export interface World {
  /** Mutable clock — assign or use `advance`. */
  now: number;
  /** The whole events container (all time, including anything hand-queued later). */
  events: TimedEvent[];
  sessions: MemoryDocStore;
  ledger: MemoryDocStore;
  /** Number of times the HEAVY all-time fetch ran. */
  historyCalls: number;
  /** Rows returned by the heavy fetch, summed. */
  historyRows: number;
  /** `sinceMs` argument of every cheap fetch, in order. */
  sinceCalls: number[];
  /** Rows returned by each cheap fetch, in order. */
  sinceRows: number[];
  deps: DjAutoplayDeps;
  /** The service started with the world. */
  svc: DjAutoplayService;
  /** A new service instance over the SAME stores — a function-host restart. */
  restart(): DjAutoplayService;
  advance(ms: number): void;
  /** Log a hand-queued song the way log-event does, timestamped now (or `at`). */
  handQueue(song: Song, opts?: { at?: number; userId?: string; eventType?: 'track' | 'album' }): void;
}

export function makeWorld(o: {
  events: TimedEvent[];
  now?: number;
  /** Defaults to the DJ_IMPL environment variable ('legacy') or the real service. */
  impl?: 'legacy' | 'service';
}): World {
  const w = {
    now: o.now ?? T0,
    events: [...o.events],
    sessions: new MemoryDocStore(),
    ledger: new MemoryDocStore(),
    historyCalls: 0,
    historyRows: 0,
    sinceCalls: [] as number[],
    sinceRows: [] as number[],
  } as World;

  w.deps = {
    fetchHistory: async () => {
      w.historyCalls++;
      const rows = [...w.events];
      w.historyRows += rows.length;
      return rows;
    },
    fetchEventsSince: async (sinceMs: number) => {
      w.sinceCalls.push(sinceMs);
      const rows = w.events.filter((e) => (e.timestamp ?? 0) >= sinceMs);
      w.sinceRows.push(rows.length);
      return rows;
    },
    sessions: w.sessions,
    ledger: w.ledger,
    now: () => w.now,
  };
  w.svc = createServiceUnderTest(w.deps, o.impl);
  w.restart = () => createServiceUnderTest(w.deps, o.impl);
  w.advance = (ms: number) => {
    w.now += ms;
  };
  w.handQueue = (song, opts = {}) => {
    w.events.push({
      userId: opts.userId ?? 'Alex',
      eventType: opts.eventType ?? 'track',
      trackName: song.trackName,
      artist: song.artist,
      uri: song.uri,
      artistId: 'artistId:hand',
      serviceId: '72711',
      accountId: '13',
      timestamp: opts.at ?? w.now,
    });
  };
  return w;
}

// ---------------------------------------------------------------------------
// A tiny Sonos queue for driving the service in tests.
// ---------------------------------------------------------------------------
export class MiniRoom {
  queue: Song[] = [];
  nowIndex: number | null = null;

  /** Add a track. An idle (empty) room starts playing it; otherwise it waits its turn. */
  land(song: Song, opts: { rekey?: boolean } = {}): void {
    this.queue.push(opts.rekey ? { ...song, uri: `${song.uri}#rekeyed` } : song);
    if (this.nowIndex === null) this.nowIndex = 0;
  }
  /** The playing track ends and the next one starts. */
  advance(): void {
    if (this.nowIndex !== null && this.nowIndex < this.queue.length - 1) this.nowIndex++;
  }
  clear(): void {
    this.queue = [];
    this.nowIndex = null;
  }

  body(
    groupId: string,
    clientId: string,
    extra: Partial<AutoplayBody> = {},
    opts: { oldClient?: boolean } = {}
  ): AutoplayBody {
    const playing = this.nowIndex === null ? null : this.queue[this.nowIndex];
    const body: AutoplayBody = {
      groupId,
      clientId,
      queueUris: this.queue.map((s) => s.uri),
      nowPlayingUri: playing?.uri ?? null,
      ...extra,
    };
    if (!opts.oldClient) {
      body.queueKeys = this.queue.map((s) => songKey(s));
      body.nowPlayingKey = playing ? songKey(playing) : null;
      body.nowPlayingIndex = this.nowIndex;
    }
    return body;
  }
}

/**
 * Log a hand-queued event for "the DJ's favourite" and return that song.
 *
 * Adding an event nudges every listener's scores, so the song that WAS first can
 * stop being first once it has been hand-queued — which would make a "the DJ must
 * skip it" assertion pass for the wrong reason. This picks a song that is still the
 * DJ's first choice with the event logged, so skipping it can only be down to the
 * exclusion logic. `logAs` lets the person's event differ from the DJ's candidate
 * (different uri, different case).
 */
export function handQueueFavourite(w: World, o: { logAs?: (s: Song) => Song; at?: number } = {}): Song {
  const logAs = o.logAs ?? ((s: Song) => s);
  const at = o.at ?? w.now;
  for (const cand of djRanking(w.events).slice(0, 8)) {
    const song = asSong(cand);
    const logged = logAs(song);
    const trial: TimedEvent[] = [
      ...w.events,
      {
        userId: 'Alex',
        eventType: 'track',
        trackName: logged.trackName,
        artist: logged.artist,
        uri: logged.uri,
        artistId: 'artistId:hand',
        timestamp: at,
      },
    ];
    if (djRanking(trial)[0] && songKey(djRanking(trial)[0]) === songKey(song)) {
      w.handQueue(logged, { at });
      return song;
    }
  }
  throw new Error('test setup: no stable favourite found among the top 8 songs');
}

export const asSong = (t: { trackName: string; artist: string; uri: string }): Song => ({
  trackName: t.trackName,
  artist: t.artist,
  uri: t.uri,
});
