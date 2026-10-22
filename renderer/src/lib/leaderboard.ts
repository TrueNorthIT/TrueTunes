// Pure helpers for the Leaderboard page.

/** The server returns at most this many top users (server/src/functions/stats.ts). */
export const TOP_USERS_CAP = 10;

/**
 * "602 tracks queued in the past 7 days". Counted from the people, not the server's totalEvents, which also
 * counts album adds. With the server's top-10 cap reached there may be more people, so it says "At least".
 * Null when nobody queued anything.
 */
export function queuedSummary(topUsers: StatsUser[], phrase: string): string | null {
  const n = topUsers.reduce((sum, u) => sum + u.count, 0);
  if (n === 0) return null;
  const tracks = `${n.toLocaleString()} ${n === 1 ? 'track' : 'tracks'} queued ${phrase}`;
  return topUsers.length >= TOP_USERS_CAP ? `At least ${tracks}` : tracks;
}

/**
 * One entry per artist, ignoring case ("Fontaines D.C." and "FONTAINES D.C."), counts summed, busiest first.
 * The name and ids come from the busiest spelling; missing ids are filled from the others.
 * ponytail: stopgap until server/src/shared/aggregate.ts keys artists case-insensitively.
 */
export function mergeArtists(artists: StatsArtist[]): StatsArtist[] {
  const byKey = new Map<string, StatsArtist>();
  for (const a of [...artists].sort((x, y) => y.count - x.count)) {
    const key = a.artist.trim().toLowerCase();
    const seen = byKey.get(key);
    if (!seen) {
      byKey.set(key, { ...a });
      continue;
    }
    seen.count += a.count;
    seen.artistId ??= a.artistId;
    seen.serviceId ??= a.serviceId;
    seen.accountId ??= a.accountId;
    seen.imageUrl ??= a.imageUrl;
  }
  return [...byKey.values()].sort((x, y) => y.count - x.count);
}
