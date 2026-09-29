import { describe, expect, it, vi } from 'vitest';
import { createGenius } from '../genius';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function setup(key: string | undefined | null = 'k') {
  const fetchImpl = vi.fn();
  const log = vi.fn();
  const g = createGenius({ getKey: () => key ?? undefined, fetchImpl: fetchImpl as unknown as typeof fetch, log });
  return { g, fetchImpl, log };
}

const auth = { headers: { Authorization: 'Bearer k' } };

describe('genius', () => {
  it('returns null without a key, without fetching', async () => {
    const { g, fetchImpl, log } = setup(null);
    expect(await g.description('t', 'a')).toBeNull();
    expect(await g.artist('a')).toBeNull();
    expect(await g.albumYear('al', 'a')).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(3);
  });

  describe('description', () => {
    it('searches then fetches the song', async () => {
      const { g, fetchImpl } = setup();
      fetchImpl
        .mockResolvedValueOnce(json({ response: { hits: [{ result: { id: 42 } }] } }))
        .mockResolvedValueOnce(json({ response: { song: { description: { dom: { tag: 'root' } } } } }));
      expect(await g.description('Song', 'Art ist')).toEqual({ tag: 'root' });
      expect(fetchImpl.mock.calls[0]).toEqual(['https://api.genius.com/search?q=Song%20Art%20ist', auth]);
      expect(fetchImpl.mock.calls[1]).toEqual(['https://api.genius.com/songs/42', auth]);
    });

    it('returns null on no hits, non-ok, missing dom, bad json, or network error', async () => {
      const { g, fetchImpl, log } = setup();
      fetchImpl.mockResolvedValueOnce(json({ response: { hits: [] } }));
      expect(await g.description('a', 'b')).toBeNull();
      fetchImpl.mockResolvedValueOnce(json({}, 500));
      expect(await g.description('a', 'b')).toBeNull();
      fetchImpl
        .mockResolvedValueOnce(json({ response: { hits: [{ result: { id: 1 } }] } }))
        .mockResolvedValueOnce(json({}, 404));
      expect(await g.description('a', 'b')).toBeNull();
      fetchImpl
        .mockResolvedValueOnce(json({ response: { hits: [{ result: { id: 1 } }] } }))
        .mockResolvedValueOnce(json({ response: { song: {} } }));
      expect(await g.description('a', 'b')).toBeNull();
      fetchImpl.mockResolvedValueOnce(new Response('nope'));
      expect(await g.description('a', 'b')).toBeNull();
      expect(log).toHaveBeenCalledWith(expect.stringContaining('[genius] error:'));
      fetchImpl.mockRejectedValueOnce(new Error('x'));
      expect(await g.description('a', 'b')).toBeNull();
    });
  });

  describe('artist', () => {
    const hit = (id: number, name: string) => ({ result: { primary_artist: { id, name } } });

    it('prefers the hit whose artist name matches, and maps the payload', async () => {
      const { g, fetchImpl } = setup();
      fetchImpl
        .mockResolvedValueOnce(json({ response: { hits: [hit(1, 'Other'), hit(2, 'The Artist')] } }))
        .mockResolvedValueOnce(
          json({
            response: {
              artist: {
                description: { dom: 'd' },
                alternate_names: ['x'],
                image_url: 'i',
                header_image_url: null,
                instagram_name: 'ig',
                twitter_name: null,
              },
            },
          }),
        );
      expect(await g.artist('artist', 'Hint')).toEqual({
        description: 'd',
        alternateNames: ['x'],
        imageUrl: 'i',
        headerImageUrl: null,
        instagram: 'ig',
        twitter: null,
      });
      expect(fetchImpl.mock.calls[0][0]).toBe('https://api.genius.com/search?q=Hint%20artist');
      expect(fetchImpl.mock.calls[1][0]).toBe('https://api.genius.com/artists/2');
    });

    it('falls back to the first hit, defaults missing fields, and nulls on failures', async () => {
      const { g, fetchImpl } = setup();
      fetchImpl
        .mockResolvedValueOnce(json({ response: { hits: [hit(9, 'Zed')] } }))
        .mockResolvedValueOnce(json({ response: { artist: {} } }));
      expect(await g.artist('nomatch')).toEqual({
        description: null,
        alternateNames: [],
        imageUrl: null,
        headerImageUrl: null,
        instagram: null,
        twitter: null,
      });
      expect(fetchImpl.mock.calls[0][0]).toBe('https://api.genius.com/search?q=nomatch');
      fetchImpl.mockResolvedValueOnce(json({ response: { hits: [] } }));
      expect(await g.artist('a')).toBeNull();
      fetchImpl.mockResolvedValueOnce(json({}, 401));
      expect(await g.artist('a')).toBeNull();
      fetchImpl
        .mockResolvedValueOnce(json({ response: { hits: [hit(1, 'a')] } }))
        .mockResolvedValueOnce(json({ response: {} }));
      expect(await g.artist('a')).toBeNull();
      fetchImpl.mockRejectedValueOnce(new Error('x'));
      expect(await g.artist('a')).toBeNull();
    });
  });

  describe('albumYear', () => {
    const hit = (name: string | null, year: number | null) => ({
      result: { primary_artist: name ? { name } : null, release_date_components: { year } },
    });

    it('returns the year of the matching-artist hit, else the first hit', async () => {
      const { g, fetchImpl } = setup();
      fetchImpl.mockResolvedValueOnce(json({ response: { hits: [hit('Other', 1999), hit('Big Band', 2001)] } }));
      expect(await g.albumYear('Alb', 'big')).toBe(2001);
      expect(fetchImpl.mock.calls[0][0]).toBe('https://api.genius.com/search?q=Alb%20big');
      fetchImpl.mockResolvedValueOnce(json({ response: { hits: [hit(null, 1980)] } }));
      expect(await g.albumYear('Alb', 'nomatch')).toBe(1980);
    });

    it('returns null for no hits, null year, non-ok, or errors', async () => {
      const { g, fetchImpl } = setup();
      fetchImpl.mockResolvedValueOnce(json({ response: { hits: [] } }));
      expect(await g.albumYear('a', 'b')).toBeNull();
      fetchImpl.mockResolvedValueOnce(json({ response: { hits: [hit('b', null)] } }));
      expect(await g.albumYear('a', 'b')).toBeNull();
      fetchImpl.mockResolvedValueOnce(json({}, 500));
      expect(await g.albumYear('a', 'b')).toBeNull();
      fetchImpl.mockRejectedValueOnce(new Error('x'));
      expect(await g.albumYear('a', 'b')).toBeNull();
    });
  });
});
