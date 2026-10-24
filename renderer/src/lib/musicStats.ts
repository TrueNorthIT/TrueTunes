// Formatting, sorting and filtering for the Music stats page. The numbers come
// straight from the server (server/src/shared/musicStats.ts); this only shapes
// them for display.

import { queryOptions } from '@tanstack/react-query';
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** People need at least this many track queues to appear on the variety chart. */
export const VARIETY_MIN_TRACKS = 20;

const nf = new Intl.NumberFormat('en-GB');

export const formatCount = (n: number) => nf.format(n);

export function isMusicStatsError(r: MusicStatsResult | { error: string } | undefined): r is { error: string } {
  return !!r && typeof (r as { error?: unknown }).error === 'string';
}

/** 148_320_000 → "41.2 h"; under an hour shows minutes ("25 min"). */
export function formatHours(ms: number): string {
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.round(ms / 60_000)} min`;
  return `${hours < 100 ? hours.toFixed(1) : formatCount(Math.round(hours))} h`;
}

/** 245_000 → "4:05"; an hour or more → "1:02:03". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export const formatPct = (pct: number) => `${Math.round(pct)}%`;

/** "2026-06" → "Jun 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Epoch ms → "14 Jun", London time. */
export function shortDay(ms: number): string {
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' });
}

/** "Mon 9:00–10:00". */
export function slotLabel(weekday: number, hour: number): string {
  return `${WEEKDAYS[weekday] ?? '?'} ${hour}:00–${(hour + 1) % 24}:00`;
}

/** Index into a ramp of `steps` colours for a count, or -1 for an empty cell. */
export function rampIndex(count: number, max: number, steps: number): number {
  if (count <= 0 || max <= 0) return -1;
  return Math.min(steps - 1, Math.floor((count / max) * steps - 1e-9));
}

export function busiestSlot(grid: number[][]): { weekday: number; hour: number; count: number } | null {
  let best: { weekday: number; hour: number; count: number } | null = null;
  grid.forEach((row, weekday) =>
    row.forEach((count, hour) => {
      if (count > 0 && (!best || count > best.count)) best = { weekday, hour, count };
    })
  );
  return best;
}

/**
 * Coverage line for the length-based sections, or null when nothing is known yet
 * (the page shows an empty state instead).
 */
export function lengthCoverage(tracksWithLength: number, uniqueTracks: number): string | null {
  if (tracksWithLength <= 0) return null;
  if (tracksWithLength >= uniqueTracks) return `Lengths known for all ${formatCount(uniqueTracks)} songs`;
  return `Lengths known for ${formatCount(tracksWithLength)} of ${formatCount(uniqueTracks)} songs`;
}

const byName = (a: MusicPersonStats, b: MusicPersonStats) => a.userId.localeCompare(b.userId);

export function airtimeRows(people: MusicPersonStats[]): MusicPersonStats[] {
  return people.filter((p) => p.airtimeMs > 0).sort((a, b) => b.airtimeMs - a.airtimeMs || byName(a, b));
}

export function avgLengthRows(people: MusicPersonStats[]): (MusicPersonStats & { avgLengthMs: number })[] {
  return people
    .filter((p): p is MusicPersonStats & { avgLengthMs: number } => p.avgLengthMs !== null && p.avgLengthMs > 0)
    .sort((a, b) => b.avgLengthMs - a.avgLengthMs || byName(a, b));
}

export function explicitRows(people: MusicPersonStats[]): (MusicPersonStats & { explicitPct: number })[] {
  return people
    .filter((p): p is MusicPersonStats & { explicitPct: number } => p.explicitPct !== null)
    .sort((a, b) => b.explicitPct - a.explicitPct || byName(a, b));
}

export function varietyRows(people: MusicPersonStats[], min = VARIETY_MIN_TRACKS): MusicPersonStats[] {
  return people.filter((p) => p.trackQueues >= min).sort((a, b) => b.variety - a.variety || byName(a, b));
}

export function requeuedRows(
  people: MusicPersonStats[]
): (MusicPersonStats & { mostRequeued: NonNullable<MusicPersonStats['mostRequeued']> })[] {
  return people
    .filter(
      (p): p is MusicPersonStats & { mostRequeued: NonNullable<MusicPersonStats['mostRequeued']> } => !!p.mostRequeued
    )
    .sort((a, b) => b.mostRequeued.count - a.mostRequeued.count || byName(a, b));
}

/** The signed-in user when they're in the list, otherwise the first person. */
export function defaultTastePerson(people: MusicPersonStats[], displayName: string | null | undefined): string | null {
  if (displayName && people.some((p) => p.userId === displayName)) return displayName;
  return people[0]?.userId ?? null;
}

export const NO_LENGTHS_TEXT = 'No song lengths yet. They’re being filled in, check back soon.';

/** React Query options for the stats page; a `{ error }` reply becomes a query error. */
export const musicStatsKeys = { all: ['music-stats'] as const };

export const musicStatsQueryOptions = () =>
  queryOptions({
    queryKey: musicStatsKeys.all,
    queryFn: async (): Promise<MusicStatsResult> => {
      const res = await window.sonos.fetchMusicStats();
      if (isMusicStatsError(res)) throw new Error(res.error);
      return res;
    },
  });
