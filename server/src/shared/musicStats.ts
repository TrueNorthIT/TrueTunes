// Music stats for the Leaderboard's stats page: everything is computed from the
// queue events plus the per-track lengths/explicit flags in the tracks table.
// Pure, so every number on the page is testable without Cosmos.
import { splitArtists } from './aggregate';

export interface MusicEvent {
  userId: string;
  eventType?: 'track' | 'album' | null;
  uri?: string | null;
  trackName: string;
  artist: string;
  imageUrl?: string | null;
  timestamp: number;
}

export interface TrackMeta {
  durationMs?: number | null;
  explicit?: boolean | null;
}

export interface ArtistCount {
  artist: string;
  count: number;
}

export interface MonthTaste {
  month: string; // YYYY-MM, London time
  queues: number;
  topArtists: ArtistCount[];
}

export interface PersonStats {
  userId: string;
  queues: number;
  trackQueues: number;
  uniqueArtists: number;
  /** Distinct artists as a share of track queues, 0..1. */
  variety: number;
  topArtists: ArtistCount[];
  mostRequeued: { trackName: string; artist: string; imageUrl: string | null; count: number } | null;
  /** Sum of known lengths of the tracks they queued. */
  airtimeMs: number;
  /** Track queues whose length is known (the airtime and average cover these). */
  timedQueues: number;
  avgLengthMs: number | null;
  /** % of their track queues with a known explicit flag that are explicit. */
  explicitPct: number | null;
  tasteByMonth: MonthTaste[];
}

export interface Discoverer {
  artist: string;
  imageUrl: string | null;
  firstBy: string;
  firstAt: number;
  totalQueues: number;
  /** Queues of this artist by anyone other than the discoverer. */
  othersQueues: number;
}

export interface TrackLength {
  trackName: string;
  artist: string;
  imageUrl: string | null;
  durationMs: number;
  queues: number;
  firstBy: string;
}

export interface MusicStatsResult {
  generatedAt: number;
  totalEvents: number;
  trackEvents: number;
  uniqueTracks: number;
  tracksWithLength: number;
  /** [weekday 0=Mon..6=Sun][hour 0..23], queue counts, London time. */
  busyHours: number[][];
  people: PersonStats[];
  discoverers: Discoverer[];
  longest: TrackLength[];
  shortest: TrackLength[];
}

export interface MusicStatsOptions {
  /** An artist counts as "popular" from this many queues. */
  popularArtistMin?: number;
  topN?: number;
  now?: number;
}

const londonParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  weekday: 'short',
  hour: '2-digit',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
});
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function londonSlot(ms: number): { weekday: number; hour: number; month: string } {
  const parts = londonParts.formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return {
    weekday: WEEKDAYS.indexOf(get('weekday')),
    hour: Number(get('hour')) % 24,
    month: `${get('year')}-${get('month')}`,
  };
}

const isTrackEvent = (e: MusicEvent) => e.eventType !== 'album';
const trackKey = (e: MusicEvent) => e.uri || `${e.trackName}|${e.artist}`;

function topCounts(counts: Map<string, number>, n: number): ArtistCount[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([artist, count]) => ({ artist, count }));
}

const bump = (m: Map<string, number>, k: string, by = 1) => m.set(k, (m.get(k) ?? 0) + by);

export function computeMusicStats(
  rawEvents: MusicEvent[],
  meta: Map<string, TrackMeta>,
  opts: MusicStatsOptions = {}
): MusicStatsResult {
  const popularArtistMin = opts.popularArtistMin ?? 15;
  const topN = opts.topN ?? 10;
  const events = rawEvents
    .filter((e) => e && typeof e.userId === 'string' && e.userId.trim() && Number.isFinite(e.timestamp))
    .map((e) => ({ ...e, userId: e.userId.trim() }))
    .sort((a, b) => a.timestamp - b.timestamp);
  const tracks = events.filter(isTrackEvent);

  const busyHours = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const e of events) {
    const { weekday, hour } = londonSlot(e.timestamp);
    if (weekday >= 0) busyHours[weekday][hour] += 1;
  }

  // ── Per person ──
  const byUser = new Map<string, MusicEvent[]>();
  for (const e of events) {
    const list = byUser.get(e.userId) ?? [];
    list.push(e);
    byUser.set(e.userId, list);
  }

  const people: PersonStats[] = [...byUser.entries()].map(([userId, list]) => {
    const own = list.filter(isTrackEvent);
    const artists = new Map<string, number>();
    const songs = new Map<string, { e: MusicEvent; count: number }>();
    const months = new Map<string, { queues: number; artists: Map<string, number> }>();
    let airtimeMs = 0;
    let timedQueues = 0;
    let explicitKnown = 0;
    let explicitCount = 0;

    for (const e of own) {
      splitArtists(e.artist).forEach((a) => bump(artists, a));
      const key = trackKey(e);
      const s = songs.get(key) ?? { e, count: 0 };
      s.count += 1;
      songs.set(key, s);

      const { month } = londonSlot(e.timestamp);
      const m = months.get(month) ?? { queues: 0, artists: new Map<string, number>() };
      m.queues += 1;
      splitArtists(e.artist).forEach((a) => bump(m.artists, a));
      months.set(month, m);

      const t = e.uri ? meta.get(e.uri) : undefined;
      if (t?.durationMs && t.durationMs > 0) {
        airtimeMs += t.durationMs;
        timedQueues += 1;
      }
      if (typeof t?.explicit === 'boolean') {
        explicitKnown += 1;
        if (t.explicit) explicitCount += 1;
      }
    }

    const top = [...songs.values()].sort((a, b) => b.count - a.count || b.e.timestamp - a.e.timestamp)[0];
    return {
      userId,
      queues: list.length,
      trackQueues: own.length,
      uniqueArtists: artists.size,
      variety: own.length > 0 ? artists.size / own.length : 0,
      topArtists: topCounts(artists, 5),
      mostRequeued:
        top && top.count > 1
          ? { trackName: top.e.trackName, artist: top.e.artist, imageUrl: top.e.imageUrl ?? null, count: top.count }
          : null,
      airtimeMs,
      timedQueues,
      avgLengthMs: timedQueues > 0 ? airtimeMs / timedQueues : null,
      explicitPct: explicitKnown > 0 ? (explicitCount / explicitKnown) * 100 : null,
      tasteByMonth: [...months.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([month, m]) => ({ month, queues: m.queues, topArtists: topCounts(m.artists, 3) })),
    };
  });
  people.sort((a, b) => b.queues - a.queues || a.userId.localeCompare(b.userId));

  // ── Discoverers: who queued each popular artist first ──
  const artistFirst = new Map<string, { e: MusicEvent; total: number; byUser: Map<string, number> }>();
  for (const e of tracks) {
    for (const a of splitArtists(e.artist)) {
      const entry = artistFirst.get(a) ?? { e, total: 0, byUser: new Map<string, number>() };
      entry.total += 1;
      bump(entry.byUser, e.userId);
      artistFirst.set(a, entry);
    }
  }
  const discoverers: Discoverer[] = [...artistFirst.entries()]
    .filter(([, v]) => v.total >= popularArtistMin)
    .map(([artist, v]) => ({
      artist,
      imageUrl: v.e.imageUrl ?? null,
      firstBy: v.e.userId,
      firstAt: v.e.timestamp,
      totalQueues: v.total,
      othersQueues: v.total - (v.byUser.get(v.e.userId) ?? 0),
    }))
    .sort((a, b) => b.othersQueues - a.othersQueues || b.totalQueues - a.totalQueues)
    .slice(0, 20);

  // ── Longest / shortest distinct tracks ──
  const distinct = new Map<string, TrackLength>();
  for (const e of tracks) {
    const t = e.uri ? meta.get(e.uri) : undefined;
    if (!e.uri || !t?.durationMs || t.durationMs <= 0) continue;
    const d = distinct.get(e.uri);
    if (d) d.queues += 1;
    else
      distinct.set(e.uri, {
        trackName: e.trackName,
        artist: e.artist,
        imageUrl: e.imageUrl ?? null,
        durationMs: t.durationMs,
        queues: 1,
        firstBy: e.userId,
      });
  }
  const lengths = [...distinct.values()];
  const uniqueUris = new Set(tracks.map((e) => e.uri).filter(Boolean));

  return {
    generatedAt: opts.now ?? Date.now(),
    totalEvents: events.length,
    trackEvents: tracks.length,
    uniqueTracks: uniqueUris.size,
    tracksWithLength: [...uniqueUris].filter((u) => (meta.get(u as string)?.durationMs ?? 0) > 0).length,
    busyHours,
    people,
    discoverers,
    longest: [...lengths].sort((a, b) => b.durationMs - a.durationMs).slice(0, topN),
    shortest: [...lengths].sort((a, b) => a.durationMs - b.durationMs).slice(0, topN),
  };
}
