import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react';
import { dailyGameQueryOptions, useDailyGame, useGameLeaderboard, useSubmitGameScore } from '../useDailyGame';

const mockFetch = vi.mocked(window.sonos.fetchDailyGame);

function wrapper({ children }: { children: React.ReactNode }) {
  return createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }, children);
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
    const interval = opts.refetchInterval({ state: { data: { id: 'g1', questions: [] } as unknown as GameFetchResult } });
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

describe('useSubmitGameScore', () => {
  it('calls submitGameScore on mutate', async () => {
    vi.mocked(window.sonos.submitGameScore).mockResolvedValue({ score: { mainScore: 3, bonusScore: 2, total: 5 } } as GameSubmitResult);
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
