import { useEffect, useState } from 'react';
import { queryOptions, useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  calculateWeeklyLeaderboard,
  isInWeek,
  londonDateId,
  previousWeekRange,
  weekRangeOf,
  weeklyWinner,
} from '../lib/queuedleWeek';
import type { WeeklyStanding } from '../lib/queuedleWeek';
import type { QueuedleDay } from '../lib/queuedleStats';
import { STALE } from '../lib/queryDefaults';
import { readChampionCache, writeChampionCache } from '../lib/championCache';
import type { Champion } from '../lib/championCache';

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

export const queuedleKeys = {
  game: (date?: string) => ['queuedle', date ?? 'today'] as const,
  leaderboard: (date?: string) => ['queuedle-leaderboard', date ?? 'today'] as const,
  dates: (userName: string | null | undefined) => ['queuedle-dates', userName ?? ''] as const,
  datesAll: ['queuedle-dates'] as const,
  history: (userName: string | null | undefined) => ['queuedle-history', userName ?? ''] as const,
  historyAll: ['queuedle-history'] as const,
  weekly: (from: string | undefined, userName: string | null | undefined) =>
    ['queuedle-weekly', from ?? '', userName ?? ''] as const,
  weeklyAll: ['queuedle-weekly'] as const,
  lastWeekWinner: (from: string | undefined) => ['queuedle-last-week-winner', from ?? ''] as const,
  stats: (gameId: string | null) => ['queuedle-stats', gameId ?? 'today'] as const,
  /** Prefix of one game's score keys, for invalidation. */
  myScoresFor: (gameId: string) => ['queuedle-my-score', gameId] as const,
  myScore: (gameId: string | null, userName: string | null | undefined) =>
    ['queuedle-my-score', gameId ?? '', userName ?? ''] as const,
};

/** Poll while the server is still generating today's game. */
export function dailyGameRefetchInterval(data: GameFetchResult | undefined): number | false {
  return data && 'status' in data && data.status === 'pending' ? 30_000 : false;
}

export function dailyGameQueryOptions(date?: string) {
  return queryOptions({
    queryKey: queuedleKeys.game(date),
    queryFn: async (): Promise<GameFetchResult> => window.sonos.fetchDailyGame(date),
    staleTime: STALE.minute,
    retry: (failureCount: number, err: unknown) => {
      void err;
      return failureCount < 3;
    },
    refetchInterval: (q) => dailyGameRefetchInterval(q.state.data),
  });
}

export function useDailyGame(date?: string) {
  return useQuery(dailyGameQueryOptions(date));
}

export const gameLeaderboardQueryOptions = (date?: string) =>
  queryOptions({
    queryKey: queuedleKeys.leaderboard(date),
    queryFn: (): Promise<GameLeaderboardResult> => window.sonos.fetchGameLeaderboard(date),
    staleTime: STALE.live,
    refetchInterval: 60_000,
  });

export function useGameLeaderboard(date?: string) {
  return useQuery(gameLeaderboardQueryOptions(date));
}

export const gameDatesQueryOptions = (userName: string | null | undefined) =>
  queryOptions({
    queryKey: queuedleKeys.dates(userName),
    queryFn: (): Promise<GameDatesResult> => window.sonos.fetchGameDates(userName ?? ''),
    enabled: userName !== undefined,
    staleTime: STALE.minute,
    refetchInterval: 5 * 60_000,
  });

export function useGameDates(userName: string | null | undefined) {
  return useQuery(gameDatesQueryOptions(userName));
}

/** Runs at most `max` of the wrapped calls at once; the rest wait their turn. */
function callPool(max: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async <T>(call: () => Promise<T>): Promise<T> => {
    if (active < max) active++;
    else await new Promise<void>((resolve) => waiting.push(resolve));
    try {
      return await call();
    } finally {
      // Hand the slot straight to the next caller, so a newcomer can't squeeze in between.
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}

/** IPC calls a history fetch keeps in flight at once, so a cold cache doesn't fire them all together. */
export const HISTORY_CONCURRENCY = 6;

/**
 * Every ready Queuedle day with its leaderboard and question count. Each day reads
 * through the per-day game and leaderboard caches that the Queuedle page uses too:
 * a ready game never changes, so it is fetched once; today's leaderboard is always
 * fetched; a past day's can still change (anyone can play an old day from the
 * calendar), so it is re-read once it is half an hour old.
 */
export async function fetchQueuedleHistory(client: QueryClient, userName: string): Promise<QueuedleDay[]> {
  const datesResult = await window.sonos.fetchGameDates(userName);
  const dates = Array.isArray(datesResult.dates) ? datesResult.dates.filter((date) => date.status === 'ready') : [];
  const today = londonDateId(Date.now());
  const pool = callPool(HISTORY_CONCURRENCY);
  const days = await Promise.all(
    dates.map(async ({ gameId }): Promise<QueuedleDay | null> => {
      try {
        const [leaderboard, game] = await Promise.all([
          client.fetchQuery({
            queryKey: queuedleKeys.leaderboard(gameId),
            queryFn: () => pool(() => window.sonos.fetchGameLeaderboard(gameId)),
            // An { error } answer is cached too, so make it stale at once and ask again next time.
            staleTime: (q) => (gameId === today || !Array.isArray(q.state.data?.scores) ? 0 : STALE.halfHour),
            gcTime: Infinity,
          }),
          client.fetchQuery({
            queryKey: queuedleKeys.game(gameId),
            queryFn: (): Promise<GameFetchResult> => pool(() => window.sonos.fetchDailyGame(gameId)),
            staleTime: (q) => (isReadyGameDoc(q.state.data) ? Infinity : 0),
            gcTime: Infinity,
          }),
        ]);
        if (!isReadyGameDoc(game)) return null;
        const scores = Array.isArray(leaderboard?.scores) ? leaderboard.scores.filter(isScoreRow) : [];
        return { gameId, questionCount: game.questions.length, scores };
      } catch {
        return null;
      }
    })
  );
  return days.filter((d): d is QueuedleDay => d !== null);
}

export function queuedleHistoryQueryOptions(userName: string | null | undefined) {
  return queryOptions({
    queryKey: queuedleKeys.history(userName),
    queryFn: ({ client }) => fetchQueuedleHistory(client, userName ?? ''),
    refetchInterval: 5 * 60_000,
  });
}

export function useQueuedleHistory(userName: string | null | undefined, enabled = true) {
  return useQuery({ ...queuedleHistoryQueryOptions(userName), enabled: enabled && userName !== undefined });
}

export function useGameRankings(userName: string | null | undefined, enabled: boolean) {
  return useQuery({
    ...queuedleHistoryQueryOptions(userName),
    select: (days): GameRanking[] =>
      calculateGameRankings(days.map((d) => ({ leaderboard: d, maxTotal: d.questionCount * 2 }))),
    enabled: enabled && userName !== undefined,
  });
}

export const weeklyLeaderboardQueryOptions = (gameId: string | null, userName: string | null | undefined) => {
  const range = gameId ? weekRangeOf(gameId) : null;
  return queryOptions({
    queryKey: queuedleKeys.weekly(range?.from, userName),
    queryFn: async (): Promise<WeeklyStanding[]> => {
      const datesResult = await window.sonos.fetchGameDates(userName ?? '');
      const dates = Array.isArray(datesResult.dates) ? datesResult.dates : [];
      const inWeek = dates.filter((d) => d.status === 'ready' && range && isInWeek(d.gameId, range));
      const boards = await Promise.all(
        inWeek.map((d) => window.sonos.fetchGameLeaderboard(d.gameId).catch(() => null))
      );
      return calculateWeeklyLeaderboard(boards);
    },
    enabled: !!range && userName !== undefined,
    staleTime: STALE.minute,
    refetchInterval: 5 * 60_000,
  });
};

export function useWeeklyLeaderboard(gameId: string | null, userName: string | null | undefined) {
  return useQuery(weeklyLeaderboardQueryOptions(gameId, userName));
}

/**
 * Last week's Queuedle winner, crowned on their avatar all this week. Mounted once, by
 * ChampionProvider; everything else reads useChampion().
 */
export function useLastWeekWinner(userName: string | null | undefined) {
  // Re-read the date now and then so Monday's handover happens without a restart.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30 * 60_000);
    return () => clearInterval(id);
  }, []);
  return useQuery(lastWeekWinnerQueryOptions(userName, londonDateId(now)));
}

/**
 * A finished week's winner can't change, so it is worked out once a week: served from
 * localStorage while the cache is for this week, never stale while the key (the week)
 * stands, and only written back when every day of the week loaded.
 */
export const lastWeekWinnerQueryOptions = (userName: string | null | undefined, today: string) => {
  const range = previousWeekRange(today);
  return queryOptions({
    queryKey: queuedleKeys.lastWeekWinner(range?.from),
    queryFn: async (): Promise<Champion | null> => {
      if (!range) return null;
      const cached = readChampionCache(range.from);
      if (cached) return cached.winner;
      const datesResult = await window.sonos.fetchGameDates(userName ?? '');
      if (!Array.isArray(datesResult.dates)) throw new Error(datesResult.error ?? 'No Queuedle dates');
      const inWeek = datesResult.dates.filter((d) => d.status === 'ready' && isInWeek(d.gameId, range));
      let complete = true;
      const boards = await Promise.all(
        inWeek.map((d) =>
          window.sonos.fetchGameLeaderboard(d.gameId).then(
            (board) => {
              if (!board || board.error) complete = false;
              return board;
            },
            () => {
              complete = false;
              return null;
            }
          )
        )
      );
      const winner = weeklyWinner(boards, range);
      // A missing day could hide the real winner: show this one for now, but work it out again next launch.
      if (complete) writeChampionCache(range.from, winner);
      return winner;
    },
    // A cached null (nobody played) is data too, so it also stands in for the fetch.
    initialData: () => (range ? readChampionCache(range.from)?.winner : undefined),
    enabled: !!range && userName !== undefined,
    staleTime: Infinity,
  });
};

export const gameStatsQueryOptions = (gameId: string | null) =>
  queryOptions({
    queryKey: queuedleKeys.stats(gameId),
    queryFn: (): Promise<GameStatsResult> => window.sonos.fetchGameStats(gameId ?? undefined),
    enabled: !!gameId,
    staleTime: STALE.minute,
    refetchInterval: 60_000,
  });

export function useGameStats(gameId: string | null) {
  return useQuery(gameStatsQueryOptions(gameId));
}

export const myScoreQueryOptions = (gameId: string | null, userName: string | null | undefined) =>
  queryOptions({
    queryKey: queuedleKeys.myScore(gameId, userName),
    queryFn: async (): Promise<GameMyScoreResult> => {
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
    staleTime: (query) => (query.state.data?.score?.guesses?.main?.length ? STALE.forever : 0),
  });

export function useMyScore(gameId: string | null, userName: string | null | undefined) {
  return useQuery(myScoreQueryOptions(gameId, userName));
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
      // Only the played day's board: invalidating them all would make the next history fetch re-read every day.
      void qc.invalidateQueries({ queryKey: queuedleKeys.leaderboard(variables.gameId) });
      void qc.invalidateQueries({ queryKey: queuedleKeys.leaderboard() });
      void qc.invalidateQueries({ queryKey: queuedleKeys.game(variables.gameId) });
      void qc.invalidateQueries({ queryKey: queuedleKeys.game() });
      void qc.invalidateQueries({ queryKey: queuedleKeys.datesAll });
      void qc.invalidateQueries({ queryKey: queuedleKeys.historyAll });
      void qc.invalidateQueries({ queryKey: queuedleKeys.weeklyAll });
      void qc.invalidateQueries({ queryKey: queuedleKeys.myScoresFor(variables.gameId) });
      void qc.invalidateQueries({ queryKey: queuedleKeys.stats(variables.gameId) });
    },
  });
}
