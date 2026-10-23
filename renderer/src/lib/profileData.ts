import { relativeDay } from './homeData';

/** 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th ... 21st. */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const suffix = ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
}

/** Where someone stands among the office's queuers, all time. null outside the top users the stats return (ten). */
export function officeRank(topUsers: StatsUser[] | undefined, userName: string): number | null {
  const i = (topUsers ?? []).findIndex((u) => u.userId === userName);
  return i < 0 ? null : i + 1;
}

/**
 * How many tracks someone has queued, from a stats result: their topUsers count, which leaves out album-add events
 * (the Leaderboard's number). Falls back to totalEvents when they aren't listed, e.g. an older server.
 */
export function queuedCount(stats: StatsResult | undefined, userName: string): number {
  return stats?.topUsers?.find((u) => u.userId === userName)?.count ?? stats?.totalEvents ?? 0;
}

/**
 * The line under a profile's name: queued all time, in the past 7 days, place in the office, and (when nothing is
 * recent) when they last queued. Zeroes and unknowns are left out.
 */
export function profileFacts({ queued, recentQueued, rank, lastQueued, now = Date.now() }: {
  queued: number; recentQueued: number; rank: number | null; lastQueued?: number | null; now?: number;
}): string[] {
  const facts: string[] = [];
  if (queued > 0) facts.push(`${queued.toLocaleString('en-GB')} queued`);
  if (recentQueued > 0) facts.push(`${recentQueued.toLocaleString('en-GB')} in the past 7 days`);
  if (rank === 1) facts.push('Most active in the office');
  else if (rank) facts.push(`${ordinal(rank)} most active in the office`);
  if (lastQueued) facts.push(`Last queued ${relativeDay(lastQueued, now).toLowerCase()}`);
  return facts;
}

/** Newest-first plays in runs by day ("Today", "Yesterday", "3 days ago"), for day headings over a list. */
export function groupByDay<T extends { lastPlayed: number }>(items: T[], now = Date.now()): Array<{ day: string; items: T[] }> {
  const groups: Array<{ day: string; items: T[] }> = [];
  for (const item of items) {
    const day = relativeDay(item.lastPlayed, now);
    const last = groups[groups.length - 1];
    if (last?.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }
  return groups;
}
