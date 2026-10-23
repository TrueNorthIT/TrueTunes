// Shared React Query timings. The QueryClient default (main.tsx) is STALE.default;
// import one of the others only where a query deliberately differs, and do not
// repeat the default on a query.

export const STALE = {
  /** Live-ish data that should refresh quickly (leaderboards). */
  live: 30_000,
  minute: 60_000,
  twoMinutes: 2 * 60_000,
  /** The QueryClient default. */
  default: 5 * 60_000,
  halfHour: 30 * 60_000,
  /** Immutable per key: lyrics, track/album metadata, Genius lookups. */
  forever: Infinity,
} as const;

/** Keep metadata warm for an hour after the last observer leaves. */
export const GC_HOUR = 60 * 60_000;
