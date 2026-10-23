import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { calculateWeeklyLeaderboard, isInWeek, londonDateId, previousWeekRange, weekRangeOf, weeklyWinner } from '../lib/queuedleWeek';
import type { WeeklyStanding } from '../lib/queuedleWeek';
import type { QueuedleDay } from '../lib/queuedleStats';

export interface GameRanking {
  userName: string;
  gamesPlayed: number;
  averageTotal: number;
  averageMain: number;
  averageBonus: number;
  averagePercent: number;
  totalScore: number;
  possibleScore: number;
  bestTotal: number;
  tierKey: GameRankTierKey;
  tierName: string;
  isProvisional: boolean;
}

// 0-100% mapped to a 0-3000 SR-like rating, used by the post-game rank-change screen.
export function computeQueuedleRating(averagePercent: number): number {
  if (!Number.isFinite(averagePercent)) return 0;
  return Math.round(Math.max(0, Math.min(100, averagePercent)) * 30);
}

interface RankingAccumulator {
  userName: string;
  gamesPlayed: number;
  totalScore: number;
  possibleScore: number;
  mainScore: number;
  bonusScore: number;
  bestTotal: number;
}

export type GameRankTierKey =
  | 'provisional'
  | 'skip-button-survivor'
  | 'background-bopper'
  | 'aux-cable-apprentice'
  | 'algorithm-whisperer'
  | 'playlist-prophet';

interface GameRankTier {
  key: GameRankTierKey;
  name: string;
}

interface GameRankingSource {
  leaderboard: unknown;
  maxTotal: number | null;
}

const MIN_TIER_GAMES = 3;

const PROVISIONAL_TIER: GameRankTier = {
  key: 'provisional',
  name: 'Provisional',
};

export function getGameRankTier(
  averagePercent: number,
  gamesPlayed: number
): GameRankTier & { isProvisional: boolean } {
  if (gamesPlayed < MIN_TIER_GAMES) {
    return { ...PROVISIONAL_TIER, isProvisional: true };
  }
  if (averagePercent >= 85) return { key: 'playlist-prophet', name: 'Playlist Prophet', isProvisional: false };
  if (averagePercent >= 70) return { key: 'algorithm-whisperer', name: 'Algorithm Whisperer', isProvisional: false };
  if (averagePercent >= 55) return { key: 'aux-cable-apprentice', name: 'Aux Cable Apprentice', isProvisional: false };
  if (averagePercent >= 40) return { key: 'background-bopper', name: 'Background Bopper', isProvisional: false };
  return { key: 'skip-button-survivor', name: 'Skip Button Survivor', isProvisional: false };
}

function isReadyGameDoc(value: unknown): value is GameDoc {
  return !!value && typeof value === 'object' && 'questions' in value && Array.isArray((value as GameDoc).questions);
}

function isScoreRow(value: unknown): value is Pick<GameScoreDoc, 'userName' | 'mainScore' | 'bonusScore' | 'total'> {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<GameScoreDoc>;
  return (
    typeof row.userName === 'string' &&
    row.userName.trim().length > 0 &&
    typeof row.mainScore === 'number' &&
    typeof row.bonusScore === 'number' &&
    typeof row.total === 'number'
  );
}

export function calculateGameRankings(sources: GameRankingSource[]): GameRanking[] {
  const byUser = new Map<string, RankingAccumulator>();

  for (const source of sources) {
    const { leaderboard, maxTotal } = source;
    if (typeof maxTotal !== 'number' || maxTotal <= 0) continue;
    if (!leaderboard || typeof leaderboard !== 'object') continue;
    const scores = (leaderboard as Partial<GameLeaderboardResult>).scores;
    if (!Array.isArray(scores)) continue;

    for (const score of scores) {
      if (!isScoreRow(score)) continue;
      const userName = score.userName.trim();
      const existing =
        byUser.get(userName) ??
        ({
          userName,
          gamesPlayed: 0,
          totalScore: 0,
          possibleScore: 0,
          mainScore: 0,
          bonusScore: 0,
          bestTotal: Number.NEGATIVE_INFINITY,
        } satisfies RankingAccumulator);

      existing.gamesPlayed += 1;
      existing.totalScore += score.total;
      existing.possibleScore += maxTotal;
      existing.mainScore += score.mainScore;
      existing.bonusScore += score.bonusScore;
      existing.bestTotal = Math.max(existing.bestTotal, score.total);
      byUser.set(userName, existing);
    }
  }

  return [...byUser.values()]
    .map((entry) => {
      const averagePercent = (entry.totalScore / entry.possibleScore) * 100;
      const tier = getGameRankTier(averagePercent, entry.gamesPlayed);
      return {
        userName: entry.userName,
        gamesPlayed: entry.gamesPlayed,
        averageTotal: entry.totalScore / entry.gamesPlayed,
        averageMain: entry.mainScore / entry.gamesPlayed,
        averageBonus: entry.bonusScore / entry.gamesPlayed,
        averagePercent,
        totalScore: entry.totalScore,
        possibleScore: entry.possibleScore,
        bestTotal: entry.bestTotal,
        tierKey: tier.key,
        tierName: tier.name,
        isProvisional: tier.isProvisional,
      };
    })
    .sort(
      (a, b) =>
        b.averageTotal - a.averageTotal ||
        b.gamesPlayed - a.gamesPlayed ||
        b.bestTotal - a.bestTotal ||
        a.userName.localeCompare(b.userName)
    );
}

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

/**
 * Every ready Queuedle day with its leaderboard and question count. One fetch
 * per day, so the rankings and the stats page share it through the cache.
 */
export async function fetchQueuedleHistory(userName: string): Promise<QueuedleDay[]> {
  const datesResult = await window.sonos.fetchGameDates(userName);
  const dates = Array.isArray(datesResult.dates) ? datesResult.dates.filter((date) => date.status === 'ready') : [];
  const days = await Promise.all(
    dates.map(async (date): Promise<QueuedleDay | null> => {
      try {
        const [leaderboard, game] = await Promise.all([
          window.sonos.fetchGameLeaderboard(date.gameId),
          window.sonos.fetchDailyGame(date.gameId),
        ]);
        if (!isReadyGameDoc(game)) return null;
        const scores = Array.isArray(leaderboard?.scores) ? leaderboard.scores.filter(isScoreRow) : [];
        return { gameId: date.gameId, questionCount: game.questions.length, scores };
      } catch {
        return null;
      }
    })
  );
  return days.filter((d): d is QueuedleDay => d !== null);
}

export function queuedleHistoryQueryOptions(userName: string | null | undefined) {
  return {
    queryKey: ['queuedle-history', userName ?? ''] as const,
    queryFn: () => fetchQueuedleHistory(userName ?? ''),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  };
}

export function useQueuedleHistory(userName: string | null | undefined, enabled = true) {
  return useQuery({ ...queuedleHistoryQueryOptions(userName), enabled: enabled && userName !== undefined });
}

export function useGameRankings(userName: string | null | undefined, enabled: boolean) {
  return useQuery<QueuedleDay[], Error, GameRanking[]>({
    ...queuedleHistoryQueryOptions(userName),
    select: (days) =>
      calculateGameRankings(days.map((d) => ({ leaderboard: d, maxTotal: d.questionCount * 2 }))),
    enabled: enabled && userName !== undefined,
  });
}

export function useWeeklyLeaderboard(gameId: string | null, userName: string | null | undefined) {
  const range = gameId ? weekRangeOf(gameId) : null;
  return useQuery<WeeklyStanding[]>({
    queryKey: ['queuedle-weekly', range?.from ?? '', userName ?? ''],
    queryFn: async () => {
      const datesResult = await window.sonos.fetchGameDates(userName ?? '');
      const dates = Array.isArray(datesResult.dates) ? datesResult.dates : [];
      const inWeek = dates.filter((d) => d.status === 'ready' && range && isInWeek(d.gameId, range));
      const boards = await Promise.all(
        inWeek.map((d) => window.sonos.fetchGameLeaderboard(d.gameId).catch(() => null))
      );
      return calculateWeeklyLeaderboard(boards);
    },
    enabled: !!range && userName !== undefined,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

/** Last week's Queuedle winner, for the gold avatar on Home all this week. */
export function useLastWeekWinner(userName: string | null | undefined) {
  // Re-read the date now and then so Monday's handover happens without a restart.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30 * 60_000);
    return () => clearInterval(id);
  }, []);
  const range = previousWeekRange(londonDateId(now));
  return useQuery({
    queryKey: ['queuedle-last-week-winner', range?.from ?? ''],
    queryFn: async () => {
      if (!range) return null;
      const datesResult = await window.sonos.fetchGameDates(userName ?? '');
      const dates = Array.isArray(datesResult.dates) ? datesResult.dates : [];
      const inWeek = dates.filter((d) => d.status === 'ready' && isInWeek(d.gameId, range));
      const boards = await Promise.all(
        inWeek.map((d) => window.sonos.fetchGameLeaderboard(d.gameId).catch(() => null))
      );
      return weeklyWinner(boards, range);
    },
    enabled: !!range && userName !== undefined,
    staleTime: 30 * 60_000,
    refetchInterval: 30 * 60_000,
  });
}

export function useGameStats(gameId: string | null) {
  return useQuery<GameStatsResult>({
    queryKey: ['queuedle-stats', gameId ?? 'today'],
    queryFn: () => window.sonos.fetchGameStats(gameId ?? undefined),
    enabled: !!gameId,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

export function useMyScore(gameId: string | null, userName: string | null | undefined) {
  return useQuery<GameMyScoreResult>({
    queryKey: ['queuedle-my-score', gameId ?? '', userName ?? ''],
    queryFn: async () => {
      const result = await window.sonos.fetchMyScore(gameId!, userName!);
      // The IPC returns { error } rather than throwing. Throw so the failure is
      // retried and never cached as if it were an answer.
      if (result?.error) throw new Error(result.error);
      return result;
    },
    enabled: !!gameId && !!userName,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    // A score with its guesses never changes, so keep it. Anything else (no score
    // yet, or a score without guesses) is re-checked on the next mount.
    staleTime: (query) => (query.state.data?.score?.guesses?.main?.length ? Infinity : 0),
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
      qc.invalidateQueries({ queryKey: ['queuedle-history'] });
      qc.invalidateQueries({ queryKey: ['queuedle-weekly'] });
      qc.invalidateQueries({ queryKey: ['queuedle-my-score', variables.gameId] });
      qc.invalidateQueries({ queryKey: ['queuedle-stats', variables.gameId] });
    },
  });
}
