import { useQuery } from '@tanstack/react-query';

export type StatsPeriod = 'today' | 'week' | 'alltime';

export function useStats(period: StatsPeriod, userId?: string, count?: number) {
  return useQuery<StatsResult>({
    queryKey: ['stats', period, userId ?? null, ...(count ? [count] : [])],
    queryFn: () => (count ? window.sonos.fetchStats(period, userId, count) : window.sonos.fetchStats(period, userId)),
    staleTime: 60_000,
    retry: 1,
  });
}
