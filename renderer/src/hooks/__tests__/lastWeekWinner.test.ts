import { describe, it, expect, vi, beforeEach } from 'vitest';
import { lastWeekWinnerQueryOptions } from '../useDailyGame';
import { CHAMPION_CACHE_KEY, readChampionCache, writeChampionCache } from '../../lib/championCache';
import { runQueryFn } from '../../test/queryFn';

const range = { from: '2026-10-19', to: '2026-10-25' };
const today = '2026-10-26'; // the Monday after
const fetchDates = vi.mocked(window.sonos.fetchGameDates);
const fetchBoard = vi.mocked(window.sonos.fetchGameLeaderboard);

const board = (gameId: string, scores: { userName: string; total: number }[]) =>
  ({ gameId, scores: scores.map((s) => ({ ...s, completedAt: Date.parse(`${gameId}T12:00:00Z`) })) }) as never;

describe("last week's winner query", () => {
  beforeEach(() => {
    localStorage.removeItem(CHAMPION_CACHE_KEY);
    fetchDates.mockReset();
    fetchBoard.mockReset();
  });

  it('serves a cached winner instantly and never refetches it within the week', async () => {
    writeChampionCache(range.from, { userName: 'Rich', total: 65, gamesPlayed: 5, bestTotal: 18, range });
    const opts = lastWeekWinnerQueryOptions('Me', today);
    expect(opts.staleTime).toBe(Infinity);
    expect(opts.queryKey).toEqual(['queuedle-last-week-winner', range.from]);
    expect((opts.initialData as () => unknown)()).toMatchObject({ userName: 'Rich' });
    await expect(runQueryFn(opts)).resolves.toMatchObject({ userName: 'Rich' });
    expect(fetchDates).not.toHaveBeenCalled();
  });

  it('serves a cached "nobody played" week as null without fetching', async () => {
    writeChampionCache(range.from, null);
    const opts = lastWeekWinnerQueryOptions('Me', today);
    expect((opts.initialData as () => unknown)()).toBeNull();
    await expect(runQueryFn(opts)).resolves.toBeNull();
    expect(fetchDates).not.toHaveBeenCalled();
  });

  it("fetches on a new week (last week's cache is a miss) and caches the result", async () => {
    writeChampionCache('2026-10-12', null);
    fetchDates.mockResolvedValue({
      dates: [
        { gameId: '2026-10-20', status: 'ready' },
        { gameId: '2026-10-21', status: 'ready' },
        { gameId: '2026-10-14', status: 'ready' }, // the week before: ignored
      ],
    } as never);
    fetchBoard.mockImplementation(async (id) =>
      id === '2026-10-20'
        ? board(id, [
            { userName: 'Abbie', total: 10 },
            { userName: 'Rich', total: 12 },
          ])
        : board(id ?? '', [{ userName: 'Abbie', total: 9 }])
    );
    const opts = lastWeekWinnerQueryOptions('Me', today);
    expect((opts.initialData as () => unknown)()).toBeUndefined();
    await expect(runQueryFn(opts)).resolves.toMatchObject({ userName: 'Abbie', total: 19 });
    expect(fetchBoard).toHaveBeenCalledTimes(2);
    expect(readChampionCache(range.from)?.winner).toMatchObject({ userName: 'Abbie' });
  });

  it('caches a week nobody played', async () => {
    fetchDates.mockResolvedValue({ dates: [] } as never);
    await expect(runQueryFn(lastWeekWinnerQueryOptions('Me', today))).resolves.toBeNull();
    expect(readChampionCache(range.from)).toEqual({ winner: null });
  });

  it("doesn't cache when a day's leaderboard failed, so the next launch asks again", async () => {
    fetchDates.mockResolvedValue({
      dates: [
        { gameId: '2026-10-20', status: 'ready' },
        { gameId: '2026-10-21', status: 'ready' },
      ],
    } as never);
    fetchBoard.mockImplementation(async (id) => {
      if (id === '2026-10-21') throw new Error('offline');
      return board(id ?? '', [{ userName: 'Rich', total: 12 }]);
    });
    await expect(runQueryFn(lastWeekWinnerQueryOptions('Me', today))).resolves.toMatchObject({ userName: 'Rich' });
    expect(readChampionCache(range.from)).toBeUndefined();
  });

  it("throws (and caches nothing) when the dates can't be loaded", async () => {
    fetchDates.mockResolvedValue({ error: 'nope' } as never);
    await expect(runQueryFn(lastWeekWinnerQueryOptions('Me', today))).rejects.toThrow('nope');
    expect(readChampionCache(range.from)).toBeUndefined();
  });
});
