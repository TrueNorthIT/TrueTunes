import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function dailyGameQueryOptions(date?: string) {
  return {
    queryKey: ['queuedle', date ?? 'today'] as const,
    queryFn: async (): Promise<GameFetchResult> => window.sonos.fetchDailyGame(date),
    staleTime: 60_000,
    retry: (failureCount: number, err: unknown) => {
      void err;
      return failureCount < 3;
    },
    refetchInterval: (q: { state: { data?: GameFetchResult } }) => {
      const d = q.state.data;
      if (d && 'status' in d && d.status === 'pending') return 30_000;
      return false as const;
    },
  };
}

export function useDailyGame(date?: string) {
  return useQuery(dailyGameQueryOptions(date));
}

export function useGameLeaderboard(date?: string) {
  return useQuery<GameLeaderboardResult>({
    queryKey: ['queuedle-leaderboard', date ?? 'today'],
    queryFn: () => window.sonos.fetchGameLeaderboard(date),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useGameDates(userName: string | null | undefined) {
  return useQuery<GameDatesResult>({
    queryKey: ['queuedle-dates', userName ?? ''],
    queryFn: () => window.sonos.fetchGameDates(userName ?? ''),
    enabled: userName !== undefined,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

export function useSubmitGameScore() {
  const qc = useQueryClient();
  return useMutation<
    GameSubmitResult,
    Error,
    {
      gameId: string;
      userName: string;
      guesses: { main: Array<'left' | 'right'>; bonus: string[] };
    }
  >({
    mutationFn: (input) => window.sonos.submitGameScore(input),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['queuedle-leaderboard'] });
      qc.invalidateQueries({ queryKey: ['queuedle', variables.gameId] });
      qc.invalidateQueries({ queryKey: ['queuedle', 'today'] });
      qc.invalidateQueries({ queryKey: ['queuedle-dates'] });
    },
  });
}
