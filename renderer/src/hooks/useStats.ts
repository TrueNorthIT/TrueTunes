import { useQuery } from '@tanstack/react-query';

export type StatsPeriod = 'today' | 'week' | 'alltime';

export function useStats(period: StatsPeriod, userId?: string) {
  return useQuery<StatsResult>({
    queryKey: ['stats', period, userId ?? null],
    queryFn: () => window.sonos.fetchStats(period, userId),
    staleTime: 60_000,
    retry: 1,
  });
}
