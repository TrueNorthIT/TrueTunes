import { describe, it, expect, vi, beforeEach } from 'vitest';
import { lyricsQueryOptions } from '../useLyrics';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

const res = (status: number, body?: unknown) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
const lyrics = (synced: string | null, plain: string | null = null, duration?: number) => ({
  syncedLyrics: synced,
  plainLyrics: plain,
  instrumental: false,
  duration,
});
const urls = () => fetchMock.mock.calls.map((c) => String(c[0]));
const keyOf = (t: string, a: string, album?: string | null, dur = 0) => lyricsQueryOptions(t, a, album, dur).queryKey;

describe('lyrics query key: one song, one key', () => {
  it('ignores case, whitespace, album and everyone after the first artist', () => {
    expect(keyOf('Kon Queso', 'MF DOOM', 'MM..FOOD'), 'Expected the same key').toEqual(
      keyOf('  kon queso ', 'mf doom, Other', null)
    );
  });

  it('strips remaster and bracketed suffixes from the track', () => {
    expect(keyOf('Song (Remastered 2011)', 'A'), 'Expected a bracketed remaster suffix ignored').toEqual(
      keyOf('Song', 'A')
    );
    expect(keyOf('Song - 2011 Remastered', 'A'), 'Expected a trailing remaster suffix ignored').toEqual(
      keyOf('Song', 'A')
    );
  });

  it('keeps different songs apart', () => {
    expect(keyOf('Song A', 'X'), 'Expected different tracks to differ').not.toEqual(keyOf('Song B', 'X'));
    expect(keyOf('Song', 'X'), 'Expected different artists to differ').not.toEqual(keyOf('Song', 'Y'));
  });
});

describe('lyrics queryFn: get, get without album, then search', () => {
  it('returns the first hit and sends album and duration as hints', async () => {
    fetchMock.mockResolvedValueOnce(res(200, lyrics('[00:01.00] hi')));
    const data = await lyricsQueryOptions('T', 'A', 'Alb', 200_000).queryFn();
    expect(data?.syncedLyrics, 'Expected the first response').toBe('[00:01.00] hi');
    expect(urls()[0], 'Expected album and duration in the first request').toMatch(
      /album_name=Alb.*duration=200|duration=200.*album_name=Alb/
    );
  });

  it('retries without the album on a 404', async () => {
    fetchMock.mockResolvedValueOnce(res(404)).mockResolvedValueOnce(res(200, lyrics('[00:01.00] hi')));
    const data = await lyricsQueryOptions('T', 'A', 'Alb', 200_000).queryFn();
    expect(data?.syncedLyrics, 'Expected the album-less retry to win').toBe('[00:01.00] hi');
    expect(urls()[1], 'Expected the retry to drop the album').not.toContain('album_name');
    expect(urls()[1], 'Expected the retry to be an api/get').toContain('/api/get');
  });

  it('falls back to search, preferring synced lyrics', async () => {
    fetchMock
      .mockResolvedValueOnce(res(404))
      .mockResolvedValueOnce(res(404))
      .mockResolvedValueOnce(res(200, [lyrics(null, 'plain only', 200), lyrics('[00:02.00] synced', null, 201)]));
    const data = await lyricsQueryOptions('T', 'A', 'Alb', 200_000).queryFn();
    expect(urls()[2], 'Expected a search request').toContain('/api/search');
    expect(data?.syncedLyrics, 'Expected the synced result over the plain one').toBe('[00:02.00] synced');
  });

  it('picks the closest duration among synced results, within 3 seconds', async () => {
    fetchMock
      .mockResolvedValueOnce(res(404))
      .mockResolvedValueOnce(
        res(200, [
          lyrics('[00:00.00] far', null, 230),
          lyrics('[00:00.00] near', null, 201),
          lyrics('[00:00.00] nearer', null, 200),
        ])
      );
    const data = await lyricsQueryOptions('T', 'A', null, 200_000).queryFn();
    expect(data?.syncedLyrics, 'Expected the closest duration').toBe('[00:00.00] nearer');
  });

  it('returns null only when every step misses', async () => {
    // album given: get with album, get without, then search
    fetchMock
      .mockResolvedValueOnce(res(404))
      .mockResolvedValueOnce(res(404))
      .mockResolvedValueOnce(res(200, [lyrics('[00:00.00] too long', null, 260)]));
    expect(
      await lyricsQueryOptions('T', 'A', 'Alb', 200_000).queryFn(),
      'Expected null when the only search hit is out of range'
    ).toBeNull();
    expect(fetchMock, 'Expected all three steps to run').toHaveBeenCalledTimes(3);
    // no album: get, then search
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(res(404)).mockResolvedValueOnce(res(200, []));
    expect(await lyricsQueryOptions('T', 'A', null, 0).queryFn(), 'Expected null for an empty search').toBeNull();
    expect(fetchMock, 'Expected two steps without an album').toHaveBeenCalledTimes(2);
  });

  it('still throws on a server error', async () => {
    fetchMock.mockResolvedValueOnce(res(500));
    await expect(lyricsQueryOptions('T', 'A', null, 0).queryFn()).rejects.toThrow();
  });
});

describe('lyrics retry: one LRCLIB outage must not hide a song for good', () => {
  const retry = lyricsQueryOptions('Vomitspit', 'MF DOOM', null, 170_000).retry as (n: number, e: Error) => boolean;

  it('retries a 503 (LRCLIB outage) up to 3 times', () => {
    expect(retry(0, new Error('LRCLIB 503'))).toBe(true);
    expect(retry(2, new Error('LRCLIB 503'))).toBe(true);
    expect(retry(3, new Error('LRCLIB 503'))).toBe(false);
  });

  it('retries network errors', () => {
    expect(retry(0, new TypeError('Failed to fetch'))).toBe(true);
  });

  it('retries a 429 (rate limited), which clears with backoff', () => {
    expect(retry(0, new Error('LRCLIB 429'))).toBe(true);
  });

  it('does not retry other 4xx, which will not change', () => {
    expect(retry(0, new Error('LRCLIB 400'))).toBe(false);
  });

  it('is disabled when the artist normalises to nothing', () => {
    expect(lyricsQueryOptions('Kookies', '', null, 0).enabled).toBe(false);
  });
});
