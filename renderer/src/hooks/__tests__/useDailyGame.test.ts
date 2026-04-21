import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dailyGameQueryOptions } from '../useDailyGame';

const mockFetch = vi.mocked(window.sonos.fetchDailyGame);

beforeEach(() => {
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
});
