import { queryOptions, useQuery } from '@tanstack/react-query';
import { STALE } from '../lib/queryDefaults';

export type StatsPeriod = 'today' | 'week' | 'alltime';

export const statsKeys = {
  period: (period: StatsPeriod, userId?: string, count?: number) =>
    ['stats', period, userId ?? null, ...(count ? [count] : [])] as const,
};

/** Queue stats for a period, optionally one person's. `count` caps the track, artist and album lists (server default 10). */
export function statsQueryOptions(period: StatsPeriod, userId?: string, count?: number) {
  return queryOptions({
    queryKey: statsKeys.period(period, userId, count),
    queryFn: (): Promise<StatsResult> =>
      count ? window.sonos.fetchStats(period, userId, count) : window.sonos.fetchStats(period, userId),
    staleTime: STALE.minute,
    retry: 1,
  });
}

export function useStats(period: StatsPeriod, userId?: string, count?: number) {
  return useQuery(statsQueryOptions(period, userId, count));
}
