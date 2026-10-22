import { useQuery } from '@tanstack/react-query';

export type StatsPeriod = 'today' | 'week' | 'alltime';

/** Queue stats for a period, optionally one person's. `count` caps the track, artist and album lists (server default 10). */
export function statsQueryOptions(period: StatsPeriod, userId?: string, count?: number) {
  return {
    queryKey: ['stats', period, userId ?? null, ...(count ? [count] : [])],
    queryFn: () => (count ? window.sonos.fetchStats(period, userId, count) : window.sonos.fetchStats(period, userId)),
    staleTime: 60_000,
    retry: 1,
  };
}

export function useStats(period: StatsPeriod, userId?: string, count?: number) {
  return useQuery<StatsResult>(statsQueryOptions(period, userId, count));
}
