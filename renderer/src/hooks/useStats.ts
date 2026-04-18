import { useQuery } from '@tanstack/react-query';

export type StatsPeriod = 'today' | 'week' | 'alltime';

export function useStats(period: StatsPeriod) {
  return useQuery<StatsResult>({
    queryKey: ['stats', period],
    queryFn: () => window.sonos.fetchStats(period),
    staleTime: 60_000,
    retry: 1,
  });
}
