import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react';
import {
  calculateGameRankings,
  dailyGameQueryOptions,
  getGameRankTier,
  useDailyGame,
  useGameLeaderboard,
  useGameRankings,
  useSubmitGameScore,
} from '../useDailyGame';

const mockFetch = vi.mocked(window.sonos.fetchDailyGame);

function rankingSource(scores: unknown[], maxTotal = 10) {
  return {
    maxTotal,
    leaderboard: { scores },
  };
}

function gameWithQuestionCount(id: string, questionCount: number): GameDoc {
  return {
    id,
    status: 'ready',
    generatedAt: 1,
    lowData: false,
    questions: new Array(questionCount).fill(null) as unknown as GameQuestion[],
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  return createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
    children
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockReset();
});

describe('dailyGameQueryOptions', () => {
  it('calls fetchDailyGame with the supplied date', async () => {
    mockFetch.mockResolvedValueOnce({ status: 'pending' });
    await dailyGameQueryOptions('2026-04-21').queryFn();
    expect(mockFetch).toHaveBeenCalledWith('2026-04-21');
  });

  it('returns the game doc when fetch succeeds', async () => {
    const game: GameDoc = {
      id: '2026-04-21',
      status: 'ready',
      generatedAt: 1,
      lowData: false,
      questions: [],
    };
    mockFetch.mockResolvedValueOnce(game);
    const result = await dailyGameQueryOptions().queryFn();
    expect(result).toBe(game);
  });

  it('returns a pending shape when the server is still generating', async () => {
    mockFetch.mockResolvedValueOnce({ status: 'pending' });
    const result = await dailyGameQueryOptions().queryFn();
    expect(result).toEqual({ status: 'pending' });
  });

  it('refetchInterval returns 30000 when status is pending', () => {
    const opts = dailyGameQueryOptions();
    const interval = opts.refetchInterval({ state: { data: { status: 'pending' } as GameFetchResult } });
    expect(interval).toBe(30_000);
  });

  it('refetchInterval returns false when data is a ready game', () => {
    const opts = dailyGameQueryOptions();
    const interval = opts.refetchInterval({
      state: { data: { id: 'g1', questions: [] } as unknown as GameFetchResult },
    });
    expect(interval).toBe(false);
  });

  it('uses "today" as default queryKey', () => {
    const opts = dailyGameQueryOptions();
    expect(opts.queryKey).toEqual(['queuedle', 'today']);
  });
});

describe('useDailyGame', () => {
  it('returns game data after fetch resolves', async () => {
    const game: GameDoc = { id: '2026-04-21', status: 'ready', generatedAt: 1, lowData: false, questions: [] };
    mockFetch.mockResolvedValue(game);
    const { result } = renderHook(() => useDailyGame(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBe(game);
  });
});

describe('useGameLeaderboard', () => {
  it('calls fetchGameLeaderboard with date', async () => {
    vi.mocked(window.sonos.fetchGameLeaderboard).mockResolvedValue({ scores: [] } as unknown as GameLeaderboardResult);
    const { result } = renderHook(() => useGameLeaderboard('2026-04-21'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(window.sonos.fetchGameLeaderboard).toHaveBeenCalledWith('2026-04-21');
  });
});

describe('calculateGameRankings', () => {
  it('averages multiple games and includes one-game players', () => {
    const rankings = calculateGameRankings([
      rankingSource(
        [
          { userName: 'alice', mainScore: 3, bonusScore: 1, total: 4 },
          { userName: 'bob', mainScore: 2, bonusScore: 2, total: 4 },
        ],
        6
      ),
      rankingSource([{ userName: 'alice', mainScore: 5, bonusScore: 1, total: 6 }], 6),
    ]);

    expect(rankings[0]).toMatchObject({
      userName: 'alice',
      gamesPlayed: 2,
      averageTotal: 5,
      averageMain: 4,
      averageBonus: 1,
      averagePercent: (10 / 12) * 100,
      bestTotal: 6,
      tierName: 'Provisional',
      isProvisional: true,
    });
    expect(rankings[1]).toMatchObject({
      userName: 'bob',
      gamesPlayed: 1,
      averageTotal: 4,
      averageMain: 2,
      averageBonus: 2,
      averagePercent: (4 / 6) * 100,
      bestTotal: 4,
      tierName: 'Provisional',
      isProvisional: true,
    });
  });

  it('applies tie-breakers deterministically', () => {
    const rankings = calculateGameRankings([
      rankingSource([
        { userName: 'alice', mainScore: 5, bonusScore: 0, total: 5 },
        { userName: 'bob', mainScore: 4, bonusScore: 0, total: 4 },
        { userName: 'carl', mainScore: 5, bonusScore: 0, total: 5 },
        { userName: 'zoe', mainScore: 5, bonusScore: 0, total: 5 },
        { userName: 'anna', mainScore: 5, bonusScore: 0, total: 5 },
      ]),
      rankingSource([
        { userName: 'alice', mainScore: 5, bonusScore: 0, total: 5 },
        { userName: 'bob', mainScore: 6, bonusScore: 0, total: 6 },
        { userName: 'carl', mainScore: 5, bonusScore: 0, total: 5 },
        { userName: 'zoe', mainScore: 5, bonusScore: 0, total: 5 },
        { userName: 'anna', mainScore: 5, bonusScore: 0, total: 5 },
      ]),
      rankingSource([{ userName: 'carl', mainScore: 5, bonusScore: 0, total: 5 }]),
    ]);

    expect(rankings.map((ranking) => ranking.userName)).toEqual(['carl', 'bob', 'alice', 'anna', 'zoe']);
  });

  it('skips missing and invalid leaderboard responses safely', () => {
    const rankings = calculateGameRankings([
      {
        maxTotal: null,
        leaderboard: { scores: [{ userName: 'skipped', mainScore: 2, bonusScore: 1, total: 3 }] },
      },
      { maxTotal: 6, leaderboard: null },
      { maxTotal: 6, leaderboard: { error: 'failed' } },
      { maxTotal: 6, leaderboard: { scores: 'not scores' } },
      rankingSource(
        [
          { userName: '', mainScore: 2, bonusScore: 1, total: 3 },
          { userName: 'alice', mainScore: 2, bonusScore: 1, total: 3 },
        ],
        6
      ),
    ]);

    expect(rankings).toHaveLength(1);
    expect(rankings[0]).toMatchObject({ userName: 'alice', gamesPlayed: 1, averageTotal: 3 });
  });

  it('assigns percentage tiers at threshold boundaries', () => {
    expect(getGameRankTier(39.9, 3).name).toBe('Skip Button Survivor');
    expect(getGameRankTier(40, 3).name).toBe('Background Bopper');
    expect(getGameRankTier(55, 3).name).toBe('Aux Cable Apprentice');
    expect(getGameRankTier(70, 3).name).toBe('Algorithm Whisperer');
    expect(getGameRankTier(85, 3).name).toBe('Playlist Prophet');
  });

  it('marks players with fewer than three games as provisional', () => {
    expect(getGameRankTier(100, 2)).toEqual({
      key: 'provisional',
      name: 'Provisional',
      isProvisional: true,
    });
  });
});

describe('useGameRankings', () => {
  it('fetches ready game leaderboards and ranks the results', async () => {
    vi.mocked(window.sonos.fetchGameDates).mockResolvedValue({
      dates: [
        { gameId: '2026-04-21', status: 'ready', userPlayed: true },
        { gameId: '2026-04-22', status: 'generating', userPlayed: false },
        { gameId: '2026-04-23', status: 'ready', userPlayed: false },
      ],
    });
    vi.mocked(window.sonos.fetchGameLeaderboard).mockImplementation(async (date?: string) => {
      if (date === '2026-04-21') {
        return {
          gameId: date,
          scores: [{ userName: 'alice', mainScore: 3, bonusScore: 1, total: 4 }],
        } as GameLeaderboardResult;
      }
      return {
        gameId: date ?? '',
        scores: [{ userName: 'alice', mainScore: 5, bonusScore: 1, total: 6 }],
      } as GameLeaderboardResult;
    });
    mockFetch.mockImplementation(async (date?: string) => gameWithQuestionCount(date ?? '', 3));

    const { result } = renderHook(() => useGameRankings('alice', true), { wrapper });

    await waitFor(() => expect(result.current.data?.[0]?.averageTotal).toBe(5));
    expect(result.current.data?.[0]?.averagePercent).toBeCloseTo((10 / 12) * 100);
    expect(window.sonos.fetchGameDates).toHaveBeenCalledWith('alice');
    expect(window.sonos.fetchGameLeaderboard).toHaveBeenCalledTimes(2);
    expect(window.sonos.fetchGameLeaderboard).toHaveBeenCalledWith('2026-04-21');
    expect(window.sonos.fetchGameLeaderboard).toHaveBeenCalledWith('2026-04-23');
    expect(window.sonos.fetchDailyGame).toHaveBeenCalledWith('2026-04-21');
    expect(window.sonos.fetchDailyGame).toHaveBeenCalledWith('2026-04-23');
  });

  it('skips missing game docs while ranking', async () => {
    vi.mocked(window.sonos.fetchGameDates).mockResolvedValue({
      dates: [
        { gameId: 'ready-game', status: 'ready', userPlayed: true },
        { gameId: 'missing-game', status: 'ready', userPlayed: true },
      ],
    });
    vi.mocked(window.sonos.fetchGameLeaderboard).mockResolvedValue({
      gameId: 'any',
      scores: [{ userName: 'alice', mainScore: 3, bonusScore: 1, total: 4 }],
    } as GameLeaderboardResult);
    mockFetch.mockImplementation(async (date?: string) => {
      if (date === 'missing-game') return { error: 'missing' };
      return gameWithQuestionCount(date ?? '', 2);
    });

    const { result } = renderHook(() => useGameRankings('alice', true), { wrapper });

    await waitFor(() => expect(result.current.data?.[0]?.gamesPlayed).toBe(1));
    expect(result.current.data?.[0]?.averagePercent).toBe(100);
  });

  it('does not fetch while disabled', () => {
    renderHook(() => useGameRankings('alice', false), { wrapper });
    expect(window.sonos.fetchGameDates).not.toHaveBeenCalled();
    expect(window.sonos.fetchGameLeaderboard).not.toHaveBeenCalled();
  });
});

describe('useSubmitGameScore', () => {
  it('calls submitGameScore on mutate', async () => {
    vi.mocked(window.sonos.submitGameScore).mockResolvedValue({
      score: { mainScore: 3, bonusScore: 2, total: 5 },
    } as GameSubmitResult);
    const { result } = renderHook(() => useSubmitGameScore(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        gameId: 'game-1',
        userName: 'alice',
        guesses: { main: ['left'], bonus: ['alice'] },
      });
    });
    expect(window.sonos.submitGameScore).toHaveBeenCalledWith({
      gameId: 'game-1',
      userName: 'alice',
      guesses: { main: ['left'], bonus: ['alice'] },
    });
  });
});
