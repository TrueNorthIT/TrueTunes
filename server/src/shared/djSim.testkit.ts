/**
 * Office-day simulation for the DJ auto-queue.
 *
 * Drives the coordinator exactly as production does — two desktop clients polling
 * every 10 seconds with their own (sometimes stale) view of one Sonos queue — over
 * a full working day, with people hand-queueing songs, queue clears, a regroup,
 * re-keyed uris, failed adds, lease swaps and a midnight rollover.
 *
 * The coordinator is pluggable: `legacy` replays the logic of dj-autoplay.ts as of
 * commit a669b2c; `service` runs createDjAutoplayService (the fix). Time is injected
 * everywhere, so nothing here touches Date.
 *
 * Compiled only into dist-test; run via `npm run sim:dj` (scripts/sim-dj.mjs).
 */

import { splitArtists } from './aggregate';
import { trackKey } from './autoplay';
import type { AutoplayBody, AutoplayResponse, TimedEvent } from './djAutoplayService';
import { DAY, HOUR, MINUTE, makeWorld, oracleLondonDay, type World } from './djKit.testkit';

const SEC = 1000;
/** A silence longer than this, with the DJ on, is a stall. */
export const STALL_SEC = 120;

// ---------------------------------------------------------------------------
// Deterministic randomness
// ---------------------------------------------------------------------------
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Synthetic office history shaped like the real data
// ---------------------------------------------------------------------------
export interface StatsShape {
  topUsers: Array<{ userId: string; count: number }>;
  topArtists: Array<{ artist: string; count: number; artistId?: string }>;
  topTracks: Array<{ trackName: string; artist: string; count: number }>;
  totalEvents: number;
}

/**
 * Real shape (all-time): 12,024 events; top-100 artists 36-246 plays; top-100
 * tracks only 6-11 plays (so every act has a long tail of songs); ~10 queuers.
 * With `stats` the top artists, users and head tracks are the real ones; without
 * it, a power-law stand-in with the same numbers is generated.
 */
export function defaultStats(): StatsShape {
  const users = ['Alex', 'Sam', 'Priya', 'Tom', 'Jess', 'Rich', 'Mo', 'Dee', 'Kit', 'Lou'];
  const topUsers = users.map((userId, i) => ({ userId, count: Math.round(3600 / (i + 1) ** 0.9) }));
  const topArtists = Array.from({ length: 100 }, (_, i) => ({
    artist: `Headliner ${i + 1}`,
    count: Math.round(246 - (210 * i) / 99),
    artistId: `artistId:h${i + 1}`,
  }));
  return { topUsers, topArtists, topTracks: [], totalEvents: 12024 };
}

export interface OfficeData {
  events: TimedEvent[];
  users: string[];
  /** Songs people might hand-queue, with weights. */
  catalogue: Array<{ trackName: string; artist: string; uri: string; weight: number }>;
}

export function buildOfficeHistory(opts: { seed: number; now: number; stats?: StatsShape }): OfficeData {
  const rand = mulberry32(opts.seed);
  const stats = opts.stats ?? defaultStats();
  const users = stats.topUsers.map((u) => u.userId);
  const userWeights = stats.topUsers.map((u) => u.count);
  const pickWeighted = (weights: number[]): number => {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rand() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return weights.length - 1;
  };

  const known = new Map<string, Array<{ trackName: string; count: number }>>();
  for (const t of stats.topTracks) {
    const list = known.get(t.artist) ?? [];
    list.push({ trackName: t.trackName, count: t.count });
    known.set(t.artist, list);
  }

  const topSum = stats.topArtists.reduce((a, b) => a + b.count, 0);
  const minorBudget = Math.max(0, stats.totalEvents - topSum);
  const acts: Array<{ artist: string; artistId: string; count: number }> = stats.topArtists.map((a, i) => ({
    artist: a.artist,
    artistId: a.artistId ?? `artistId:top${i}`,
    count: a.count,
  }));
  // The long tail of minor acts: many artists, each only a handful of plays.
  let spent = 0;
  for (let i = 0; spent < minorBudget; i++) {
    const count = Math.min(minorBudget - spent, Math.max(2, Math.round(2 + 28 * rand() ** 3)));
    acts.push({ artist: `Minor Act ${i + 1}`, artistId: `artistId:m${i}`, count });
    spent += count;
  }

  const events: TimedEvent[] = [];
  const catalogue: OfficeData['catalogue'] = [];
  let uriSeq = 0;
  for (const act of acts) {
    // Each act has a few fans in the office, weighted towards the heavy queuers.
    const fanCount = 1 + Math.floor(rand() * 4);
    const fans = new Set<number>();
    while (fans.size < fanCount) fans.add(pickWeighted(userWeights));
    const fanIdx = [...fans];
    const fanWeights = fanIdx.map((i) => userWeights[i]);

    // Songs: nobody replays one song more than ~11 times, so plays spread over many.
    const maxPerSong = 11;
    const songCount = Math.max(1, Math.ceil(act.count / (act.count > 40 ? 7 : 3)));
    const names: Array<{ trackName: string; count: number }> = [...(known.get(act.artist) ?? [])];
    let assigned = names.reduce((a, b) => a + b.count, 0);
    for (let s = names.length; assigned < act.count; s++) {
      const left = act.count - assigned;
      const n = Math.min(left, Math.max(1, Math.min(maxPerSong, Math.round((songCount > 0 ? act.count / songCount : 1) * (0.5 + rand())))));
      names.push({ trackName: `${act.artist} Song ${s + 1}`, count: n });
      assigned += n;
    }

    for (const song of names) {
      const uri = `x-sonos-http:track:${(++uriSeq).toString(36)}.mp4`;
      catalogue.push({ trackName: song.trackName, artist: act.artist, uri, weight: song.count * Math.sqrt(act.count) });
      for (let p = 0; p < song.count; p++) {
        events.push({
          userId: users[fanIdx[pickWeighted(fanWeights)]],
          eventType: 'track',
          trackName: song.trackName,
          artist: act.artist,
          uri,
          artistId: act.artistId,
          serviceId: '72711',
          accountId: '13',
          timestamp: opts.now - DAY - Math.floor(rand() * 399 * DAY),
        });
      }
    }
  }
  events.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
  return { events, users, catalogue };
}

// ---------------------------------------------------------------------------
// The simulated Sonos queue
// ---------------------------------------------------------------------------
interface QEntry {
  uri: string;
  trackName: string;
  artist: string;
  key: string;
  by: 'dj' | 'person';
  /** When the entry was asked for: the person's click, or the DJ's enqueue instruction. */
  queuedAt: number;
}
interface RoomSnap {
  t: number;
  queue: QEntry[];
  playhead: number | null;
}

class SimRoom {
  groupId = 'group-1';
  queue: QEntry[] = [];
  playhead: number | null = null;
  playing = false;
  playUntil = 0;
  idleSince: number | null = 0;
  snaps: RoomSnap[] = [];
  onStart?: (e: QEntry, t: number) => void;
  onIdleEnd?: (gapMs: number, t: number) => void;

  constructor(private rand: () => number, startT: number) {
    this.idleSince = startT;
    this.snaps.push({ t: startT, queue: [], playhead: null });
  }

  private snap(t: number): void {
    this.snaps.push({ t, queue: this.queue.slice(), playhead: this.playhead });
  }

  private start(t: number): void {
    this.playing = true;
    this.playUntil = t + (120 + Math.floor(this.rand() * 106)) * SEC;
    if (this.idleSince !== null) {
      this.onIdleEnd?.(t - this.idleSince, t);
      this.idleSince = null;
    }
    const entry = this.queue[this.playhead as number];
    this.onStart?.(entry, t);
  }

  tick(t: number): void {
    if (this.playing && t >= this.playUntil) {
      this.playing = false;
      if (this.playhead !== null && this.playhead + 1 < this.queue.length) {
        this.playhead++;
        this.snap(t);
        this.start(t);
      } else {
        this.idleSince = t; // ran off the end of the queue — silence
      }
    } else if (!this.playing && this.queue.length > 0) {
      // Something was added to an idle room: it resumes.
      const next = this.playhead === null ? 0 : this.playhead + 1;
      if (next < this.queue.length) {
        this.playhead = next;
        this.snap(t);
        this.start(t);
      }
    }
  }

  append(e: QEntry, t: number): void {
    this.queue.push(e);
    this.snap(t);
  }

  /** People's songs go in ahead of a DJ filler that hasn't started playing yet. */
  insertPerson(e: QEntry, t: number): void {
    const last = this.queue[this.queue.length - 1];
    const lastIdx = this.queue.length - 1;
    if (last && last.by === 'dj' && (this.playhead === null || lastIdx > this.playhead)) {
      this.queue.splice(lastIdx, 0, e);
    } else {
      this.queue.push(e);
    }
    this.snap(t);
  }

  clear(t: number): void {
    this.queue = [];
    this.playhead = null;
    if (this.playing) this.idleSince = t;
    this.playing = false;
    this.snap(t);
  }

  snapshotAt(t: number): RoomSnap {
    let lo = 0;
    let hi = this.snaps.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.snaps[mid].t <= t) lo = mid;
      else hi = mid - 1;
    }
    return this.snaps[lo];
  }

  prune(before: number): void {
    // Keep memory flat on long runs: drop snapshots nobody can ask for any more.
    const i = this.snaps.findIndex((s) => s.t > before);
    if (i > 1) this.snaps.splice(0, i - 1);
  }
}

// ---------------------------------------------------------------------------
// The simulation
// ---------------------------------------------------------------------------
export interface SimOptions {
  impl: 'legacy' | 'service';
  seed?: number;
  /** Real or stand-in stats the history is built from. */
  stats?: StatsShape;
  /** Pre-built history (overrides `stats`) — used by the in-suite run to stay small. */
  data?: OfficeData;
  /** Defaults to 09:00 BST on 20 Oct 2026. */
  startMs?: number;
  /** Defaults to 18:00 BST that day. */
  endMs?: number;
  handQueued?: number;
  /** Run 23:50 -> 00:30 BST over midnight afterwards. */
  rollover?: boolean;
  /** End of the rollover run; defaults to 00:30 BST on the 21st. */
  rolloverEndMs?: number;
  /** Scale the scheduled disruptions into the (shorter) window. Default true. */
  progress?: (msg: string) => void;
}

export interface DayReport {
  day: string;
  djPicks: number;
  handQueued: number;
  /** A second enqueue INSTRUCTION for a song within one London day. */
  duplicatePicks: number;
  /** DJ picks of a song a person had hand-queued earlier the same day. */
  collisionsWithHandQueued: number;
  /** DJ-sourced tracks that actually started a second time that day (heard twice). */
  heardTwice: number;
  distinctArtists: number;
  distinctSongs: number;
  /** Consecutive DJ picks by the same act (a variety indicator, not a requirement). */
  backToBackSameArtist: number;
  /**
   * Silences longer than STALL_SEC while the DJ was enabled. The threshold sits above
   * the unavoidable recovery from a dropped add on an idle room (60s failed-add
   * timeout + up to 10s to the next poll + add latency), so a correct coordinator
   * reads 0 and a stuck one does not.
   */
  stalls: number;
  /** Informational: silences over 60s, including those recoveries. */
  gapsOver60s: number;
  longestStallSec: number;
}

export interface SimReport {
  impl: 'legacy' | 'service';
  seed: number;
  days: DayReport[];
  adds: { told: number; landed: number; dropped: number; late: number };
  calls: number;
  meanCallMs: number;
  heavyHistoryFetches: number;
  rolloverRepeats: number | null;
  /** Session documents / ledger documents in the stores at the end. */
  docs: { sessions: number; ledger: number };
  /** Every enqueue instruction, in order — for debugging a run. */
  picks: Array<{ at: string; day: string; key: string; artist: string }>;
}

const bst = (h: number, m = 0, s = 0): number => Date.UTC(2026, 9, 20, h - 1, m, s); // BST = UTC+1 on 20 Oct 2026
const bstNext = (h: number, m = 0, s = 0): number => Date.UTC(2026, 9, 21, h - 1, m, s);

export async function runOfficeDay(opts: SimOptions): Promise<SimReport> {
  const seed = opts.seed ?? 42;
  const rand = mulberry32(seed ^ 0x9e3779b9);
  const startMs = opts.startMs ?? bst(9);
  const endMs = opts.endMs ?? bst(18);
  const log = opts.progress ?? (() => undefined);
  const data = opts.data ?? buildOfficeHistory({ seed, now: startMs, stats: opts.stats });

  const w: World = makeWorld({ events: data.events, now: startMs, impl: opts.impl });
  const room = new SimRoom(rand, startMs);
  const listeners = data.users.slice(0, 4);

  // ---- bookkeeping --------------------------------------------------------
  interface Instruction { t: number; key: string; day: string; artist: string }
  const instructions: Instruction[] = [];
  const handByDay = new Map<string, Map<string, number>>();
  const heardByDay = new Map<string, Map<string, QEntry[]>>();
  const idleGaps: Array<{ day: string; gapMs: number }> = [];
  const adds = { told: 0, landed: 0, dropped: 0, late: 0 };
  let calls = 0;
  let callMs = 0;
  let djPicksSeen = 0;
  const heardTwice = new Map<string, number>();
  const handQueuedCount = new Map<string, number>();
  let currentUpcoming: AutoplayResponse['upcoming'] = [];

  let t = startMs;
  room.onStart = (e, at) => {
    const day = oracleLondonDay(at);
    const heard = heardByDay.get(day) ?? new Map<string, QEntry[]>();
    const before = heard.get(e.key) ?? [];
    // A DJ song counts as "heard twice" only if it had ALREADY been heard when the DJ
    // asked for it. A person choosing to queue a song the DJ has parked is their call.
    if (e.by === 'dj' && before.some((h) => h.by === 'dj' || h.queuedAt < e.queuedAt)) {
      heardTwice.set(day, (heardTwice.get(day) ?? 0) + 1);
    }
    before.push(e);
    heard.set(e.key, before);
    heardByDay.set(day, heard);
  };
  room.onIdleEnd = (gapMs, at) => idleGaps.push({ day: oracleLondonDay(at), gapMs });

  // ---- clients ------------------------------------------------------------
  interface Client {
    id: string;
    offset: number;
    offlineFrom: number;
    offlineUntil: number;
    busyUntil: number;
    pendingEnable: boolean;
    seenGroup: string;
  }
  const clients: Client[] = [
    { id: 'client-A', offset: 0, offlineFrom: 0, offlineUntil: 0, busyUntil: 0, pendingEnable: true, seenGroup: '' },
    { id: 'client-B', offset: 5 * SEC, offlineFrom: 0, offlineUntil: 0, busyUntil: 0, pendingEnable: false, seenGroup: '' },
  ];
  const offline = (c: Client, from: number, forMs: number): { from: number; until: number } => ({
    from,
    until: from + forMs,
  });
  const outages: Array<{ client: number; from: number; until: number }> = [];
  const addOutage = (client: number, from: number, forMs: number): void => {
    const o = offline(clients[client], from, forMs);
    outages.push({ client, from: o.from, until: o.until });
  };

  // ---- the scheduled day --------------------------------------------------
  type Event = { at: number; run: () => void };
  const schedule: Event[] = [];
  const at = (when: number, run: () => void): void => {
    schedule.push({ at: when, run });
  };

  const pickPersonSong = (): { trackName: string; artist: string; uri: string } => {
    const r = rand();
    if (r < 0.45 && currentUpcoming.length > 0) {
      // Someone likes what the preview is showing and queues it themselves.
      const u = currentUpcoming[Math.floor(rand() * currentUpcoming.length)];
      return { trackName: u.trackName, artist: u.artist, uri: u.uri };
    }
    if (r < 0.7) {
      // A house favourite: one of the room's biggest songs.
      const top = data.catalogue.slice().sort((a, b) => b.weight - a.weight).slice(0, 60);
      return top[Math.floor(rand() * top.length)];
    }
    const total = data.catalogue.reduce((a, b) => a + b.weight, 0);
    let x = rand() * total;
    for (const c of data.catalogue) {
      x -= c.weight;
      if (x <= 0) return c;
    }
    return data.catalogue[0];
  };

  const handQueue = (): void => {
    const song = pickPersonSong();
    const drifted = rand() < 0.4;
    const uri = drifted ? `${song.uri}~person${Math.floor(rand() * 1e6)}` : song.uri;
    const day = oracleLondonDay(t);
    const key = trackKey(song.trackName, song.artist);
    w.events.push({
      userId: listeners[Math.floor(rand() * listeners.length)],
      eventType: 'track',
      trackName: song.trackName,
      artist: song.artist,
      uri,
      artistId: 'artistId:hand',
      serviceId: '72711',
      accountId: '13',
      timestamp: t,
    });
    const m = handByDay.get(day) ?? new Map<string, number>();
    if (!m.has(key)) m.set(key, t);
    handByDay.set(day, m);
    handQueuedCount.set(day, (handQueuedCount.get(day) ?? 0) + 1);
    room.insertPerson({ uri, trackName: song.trackName, artist: song.artist, key, by: 'person', queuedAt: t }, t);
  };

  const dayRange = endMs - startMs;
  const wantHand = opts.handQueued ?? 40;
  for (let i = 0; i < wantHand; i++) {
    // Clustered a little around the morning, lunch and mid-afternoon.
    const hump = [0.12, 0.42, 0.7][Math.floor(rand() * 3)];
    const frac = Math.min(0.97, Math.max(0.02, hump + (rand() - 0.5) * 0.3));
    at(startMs + Math.floor(frac * dayRange), handQueue);
  }
  // Queue clears
  for (const f of [0.22, 0.52, 0.78]) at(startMs + Math.floor(f * dayRange), () => room.clear(t));
  // Regroup: a new groupId for the same room; someone switches the DJ back on.
  at(startMs + Math.floor(0.45 * dayRange), () => {
    room.groupId = 'group-2';
    clients[0].pendingEnable = true;
  });
  // Clients dropping off (lid closed, wifi) for 45-90s: the lease swaps, and the
  // returning client reports a snapshot from before it went quiet.
  addOutage(0, startMs + Math.floor(0.1 * dayRange), 50 * SEC);
  addOutage(1, startMs + Math.floor(0.2 * dayRange), 60 * SEC);
  addOutage(0, startMs + Math.floor(0.33 * dayRange), 75 * SEC);
  addOutage(1, startMs + Math.floor(0.47 * dayRange), 50 * SEC);
  addOutage(0, startMs + Math.floor(0.6 * dayRange), 45 * SEC);
  addOutage(1, startMs + Math.floor(0.72 * dayRange), 70 * SEC);
  addOutage(0, startMs + Math.floor(0.85 * dayRange), 90 * SEC);
  schedule.sort((a, b) => a.at - b.at);

  // ---- the polling loop ---------------------------------------------------
  const inFlight: Array<{ instrAt: number; landAt: number; client: Client; entryUri: string; trackName: string; artist: string; drop: boolean }> = [];
  let rekeySeq = 0;

  const bodyFor = (c: Client, now: number): AutoplayBody => {
    const out = outages.find((o) => o.client === clients.indexOf(c) && now >= o.until && now < o.until + 15 * SEC);
    let lag = 0;
    if (out) lag = now - out.from + 5 * SEC; // first poll after waking: a snapshot from before it slept
    else if (rand() < 0.2) lag = (5 + Math.floor(rand() * 20)) * SEC; // plain staleness
    const snap = room.snapshotAt(now - lag);
    const playing = snap.playhead === null ? null : snap.queue[snap.playhead];
    const body: AutoplayBody = {
      groupId: room.groupId,
      clientId: c.id,
      queueUris: snap.queue.map((e) => e.uri),
      queueKeys: snap.queue.map((e) => e.key),
      nowPlayingUri: playing?.uri ?? null,
      nowPlayingKey: playing?.key ?? null,
      nowPlayingIndex: snap.playhead,
      users: listeners,
    };
    if (c.pendingEnable) {
      body.setEnabled = true;
      c.pendingEnable = false;
    }
    return body;
  };

  const doPoll = async (c: Client, now: number): Promise<void> => {
    const body = bodyFor(c, now);
    const started = process.hrtime.bigint();
    let res: AutoplayResponse;
    try {
      res = await w.svc.handle(body);
    } catch {
      return; // a 500: the client just tries again in 10 seconds
    } finally {
      calls++;
      callMs += Number(process.hrtime.bigint() - started) / 1e6;
    }
    if (res.upcoming.length) currentUpcoming = res.upcoming;
    if (res.leaseHeld && res.enqueue && now >= c.busyUntil) {
      const e = res.enqueue;
      const key = trackKey(e.trackName, e.artist);
      djPicksSeen++;
      adds.told++;
      instructions.push({ t: now, key, day: oracleLondonDay(now), artist: e.artist });
      const roll = rand();
      const latency = (2 + Math.floor(rand() * 5)) * SEC;
      const drop = roll < 0.07;
      const late = !drop && roll < 0.1;
      c.busyUntil = now + latency;
      inFlight.push({
        instrAt: now,
        landAt: now + (late ? 75 * SEC : latency),
        client: c,
        entryUri: e.uri,
        trackName: e.trackName,
        artist: e.artist,
        drop,
      });
      if (drop) adds.dropped++;
      if (late) adds.late++;
    }
  };

  const runWindow = async (from: number, to: number, label: string): Promise<void> => {
    let si = schedule.findIndex((s) => s.at >= from);
    if (si < 0) si = schedule.length;
    let nextReport = from + HOUR;
    for (t = from; t < to; t += SEC) {
      w.now = t;
      // scheduled happenings
      while (si < schedule.length && schedule[si].at <= t) schedule[si++].run();
      // adds landing
      for (let i = inFlight.length - 1; i >= 0; i--) {
        const f = inFlight[i];
        if (f.landAt <= t) {
          inFlight.splice(i, 1);
          if (!f.drop) {
            const rekeyed = rand() < 0.4;
            const uri = rekeyed ? `${f.entryUri}~rk${++rekeySeq}` : f.entryUri;
            room.append({ uri, trackName: f.trackName, artist: f.artist, key: trackKey(f.trackName, f.artist), by: 'dj', queuedAt: f.instrAt }, t);
            adds.landed++;
          }
        }
      }
      room.tick(t);
      // polls
      const due = clients.filter((c) => (t - startMs - c.offset) % (10 * SEC) === 0 && !outages.some((o) => o.client === clients.indexOf(c) && t >= o.from && t < o.until));
      if (due.length === 1 && rand() < 0.1) {
        // Occasionally the other client polls in the very same instant.
        const other = clients.find((c) => c !== due[0]);
        if (other && !outages.some((o) => o.client === clients.indexOf(other) && t >= o.from && t < o.until)) due.push(other);
      }
      if (due.length > 0) await Promise.all(due.map((c) => doPoll(c, t)));
      if (t >= nextReport) {
        log(`${label} ${new Date(t).toISOString().slice(11, 16)}Z  picks=${djPicksSeen} calls=${calls}`);
        nextReport += HOUR;
        room.prune(t - 5 * MINUTE);
      }
    }
  };

  // Day one.
  await runWindow(startMs, endMs, 'day');

  // Midnight rollover: the office goes home, the DJ stays enabled, music resumes
  // at 23:50 and carries on past London midnight (00:00 BST = 23:00 UTC).
  let rolloverRepeats: number | null = null;
  if (opts.rollover !== false) {
    room.clear(endMs);
    inFlight.length = 0;
    const from = bst(23, 50);
    const to = opts.rolloverEndMs ?? bstNext(0, 30);
    // A couple of people queue songs either side of midnight.
    schedule.length = 0;
    schedule.push({ at: bst(23, 55), run: handQueue }, { at: bstNext(0, 10), run: handQueue }, { at: bstNext(0, 20), run: handQueue });
    room.idleSince = from;
    await runWindow(from, to, 'night');

    const day1 = oracleLondonDay(bst(12));
    const day2 = oracleLondonDay(bstNext(0, 15));
    const day1Keys = new Set(instructions.filter((i) => i.day === day1).map((i) => i.key));
    rolloverRepeats = instructions.filter((i) => i.day === day2 && day1Keys.has(i.key)).length;
  }

  // ---- report -------------------------------------------------------------
  const days = [...new Set(instructions.map((i) => i.day))].sort();
  const dayReports: DayReport[] = days.map((day) => {
    const mine = instructions.filter((i) => i.day === day);
    const seen = new Set<string>();
    let dup = 0;
    let coll = 0;
    const hand = handByDay.get(day) ?? new Map<string, number>();
    for (const i of mine) {
      if (seen.has(i.key)) dup++;
      seen.add(i.key);
      const handAt = hand.get(i.key);
      if (handAt !== undefined && handAt < i.t) coll++;
    }
    let b2b = 0;
    mine.forEach((i, n) => {
      if (n > 0 && mine[n - 1].artist === i.artist) b2b++;
    });
    const gaps = idleGaps.filter((g) => g.day === day && g.gapMs > STALL_SEC * SEC);
    const over60 = idleGaps.filter((g) => g.day === day && g.gapMs > 60 * SEC).length;
    return {
      day,
      djPicks: mine.length,
      handQueued: handQueuedCount.get(day) ?? 0,
      duplicatePicks: dup,
      collisionsWithHandQueued: coll,
      heardTwice: heardTwice.get(day) ?? 0,
      distinctArtists: new Set(mine.map((i) => splitArtists(i.artist)[0] ?? i.artist)).size,
      distinctSongs: seen.size,
      backToBackSameArtist: b2b,
      stalls: gaps.length,
      gapsOver60s: over60,
      longestStallSec: Math.round(Math.max(0, ...gaps.map((g) => g.gapMs)) / SEC),
    };
  });

  return {
    impl: opts.impl,
    seed,
    days: dayReports,
    adds,
    calls,
    meanCallMs: calls ? callMs / calls : 0,
    heavyHistoryFetches: w.historyCalls,
    rolloverRepeats,
    docs: { sessions: w.sessions.docs.size, ledger: w.ledger.docs.size },
    picks: instructions.map((i) => ({ at: new Date(i.t).toISOString(), day: i.day, key: i.key, artist: i.artist })),
  };
}

export function formatReport(r: SimReport): string {
  const lines: string[] = [];
  lines.push(`DJ office-day simulation — coordinator: ${r.impl}, seed ${r.seed}`);
  for (const d of r.days) {
    lines.push(`  London day ${d.day}`);
    lines.push(`    DJ picks (enqueue instructions)      ${d.djPicks}`);
    lines.push(`    hand-queued songs                    ${d.handQueued}`);
    lines.push(`    duplicate picks within the day       ${d.duplicatePicks}`);
    lines.push(`    picks colliding with hand-queued     ${d.collisionsWithHandQueued}`);
    lines.push(`    DJ songs heard a second time         ${d.heardTwice}`);
    lines.push(`    distinct artists / distinct songs    ${d.distinctArtists} / ${d.distinctSongs}`);
    lines.push(`    back-to-back picks by the same act   ${d.backToBackSameArtist}`);
    lines.push(`    stalls (> ${STALL_SEC}s of silence)           ${d.stalls}${d.stalls ? ` (longest ${d.longestStallSec}s)` : ''}   [silences > 60s: ${d.gapsOver60s}]`);
  }
  lines.push(`  adds told/landed/dropped/late          ${r.adds.told}/${r.adds.landed}/${r.adds.dropped}/${r.adds.late}`);
  lines.push(`  songs repeated across midnight         ${r.rolloverRepeats === null ? 'n/a' : r.rolloverRepeats} (allowed, informational: the day resets)`);
  lines.push(`  coordinator calls / mean ms per call   ${r.calls} / ${r.meanCallMs.toFixed(1)}`);
  lines.push(`  heavy all-time history fetches         ${r.heavyHistoryFetches}`);
  lines.push(`  documents at end (sessions/ledger)     ${r.docs.sessions}/${r.docs.ledger}`);
  return lines.join('\n');
}
