import { describe, it, expect, vi, beforeEach } from 'vitest';
import { djSetQueryOptions } from '../useDjSet';

beforeEach(() => {
  vi.mocked(window.sonos.fetchDjSet).mockReset();
});

describe('djSetQueryOptions', () => {
  it('passes the options straight through to the bridge', async () => {
    vi.mocked(window.sonos.fetchDjSet).mockResolvedValueOnce({
      tracks: [],
      listeners: [],
      artistsConsidered: 0,
      inferredListeners: false,
    });
    const opts = { users: ['Rich'], limit: 5 };
    await djSetQueryOptions(opts).queryFn();
    expect(window.sonos.fetchDjSet).toHaveBeenCalledWith(opts);
  });

  /**
   * `main.ts` returns `{ error }` alone when the fetch fails — no arrays at all.
   * Components read `data.listeners` directly, so the gaps have to be filled
   * here or opening the panel throws.
   */
  it('fills in the arrays when the bridge returns only an error', async () => {
    vi.mocked(window.sonos.fetchDjSet).mockResolvedValueOnce({ error: 'fetch failed' });

    const result = await djSetQueryOptions().queryFn();

    expect(result.tracks).toEqual([]);
    expect(result.listeners).toEqual([]);
    expect(result.artistsConsidered).toBe(0);
    expect(result.error).toBe('fetch failed');
    // The crash was `data.listeners.includes(...)` on this shape.
    expect(() => result.listeners.includes('Rich')).not.toThrow();
  });

  it('survives a null response', async () => {
    vi.mocked(window.sonos.fetchDjSet).mockResolvedValueOnce(
      null as unknown as DjSetResponse,
    );
    const result = await djSetQueryOptions().queryFn();
    expect(result.listeners).toEqual([]);
    expect(result.tracks).toEqual([]);
  });

  it('keeps a good response intact', async () => {
    vi.mocked(window.sonos.fetchDjSet).mockResolvedValueOnce({
      tracks: [
        {
          uri: 'u1',
          trackName: 'Loser',
          artist: 'Tame Impala',
          score: 0.53,
          because: 'Sam, Alex and Joe Pitts queue Tame Impala',
        },
      ],
      listeners: ['Sam', 'Alex'],
      artistsConsidered: 409,
      inferredListeners: true,
    });

    const result = await djSetQueryOptions().queryFn();
    expect(result.tracks).toHaveLength(1);
    expect(result.listeners).toEqual(['Sam', 'Alex']);
    expect(result.artistsConsidered).toBe(409);
  });
});
