import { describe, it, expect, vi, beforeEach } from 'vitest';
import { geniusAlbumAboutQueryOptions, geniusArtistBioQueryOptions, releasedLabel } from '../useGeniusAlbumAbout';

const p = (...children: GeniusDomNode[]) => ({ tag: 'p', children });

beforeEach(() => {
  vi.mocked(window.sonos.geniusAlbumAbout).mockReset();
  vi.mocked(window.sonos.geniusArtist).mockReset();
});

describe('geniusAlbumAboutQueryOptions', () => {
  it('turns the description into plain paragraphs, with a readable date and the Genius link', async () => {
    vi.mocked(window.sonos.geniusAlbumAbout).mockResolvedValueOnce({
      description: { tag: 'root', children: [p({ tag: 'em', children: ['Royal Blood'] }, ' is the debut.'), '', p('Second.')] },
      releaseDate: '2014-08-22',
      url: 'https://genius.com/albums/Royal-blood/Royal-blood',
    });
    const r = await geniusAlbumAboutQueryOptions('Royal Blood (10th Anniversary Edition)', 'Royal Blood').queryFn();
    expect(window.sonos.geniusAlbumAbout).toHaveBeenCalledWith('Royal Blood (10th Anniversary Edition)', 'Royal Blood');
    expect(r).toEqual({ paragraphs: ['Royal Blood is the debut.', 'Second.'], released: '22 August 2014', url: 'https://genius.com/albums/Royal-blood/Royal-blood' });
  });

  it('keeps the opening three paragraphs and treats "?" as no description', async () => {
    vi.mocked(window.sonos.geniusAlbumAbout).mockResolvedValueOnce({ description: { tag: 'root', children: [p('1'), p('2'), p('3'), p('4')] } });
    expect((await geniusAlbumAboutQueryOptions('A', 'B').queryFn())?.paragraphs).toEqual(['1', '2', '3']);
    vi.mocked(window.sonos.geniusAlbumAbout).mockResolvedValueOnce({ description: { tag: 'root', children: [p('?')] } });
    expect((await geniusAlbumAboutQueryOptions('A', 'B').queryFn())?.paragraphs).toEqual([]);
    vi.mocked(window.sonos.geniusAlbumAbout).mockResolvedValueOnce(null);
    expect(await geniusAlbumAboutQueryOptions('A', 'B').queryFn()).toBeNull();
  });

  it('is keyed by album and artist, cached for good, and waits for both names', () => {
    const o = geniusAlbumAboutQueryOptions('A', 'B');
    expect(o.queryKey).toEqual(['genius-album-about', 'A', 'B']);
    expect(o.staleTime).toBe(Infinity);
    expect(geniusAlbumAboutQueryOptions('A', null).enabled).toBe(false);
  });
});

describe('geniusArtistBioQueryOptions', () => {
  it('returns the bio paragraphs and the artist page', async () => {
    vi.mocked(window.sonos.geniusArtist).mockResolvedValueOnce({
      description: { tag: 'root', children: [p('A rock duo from Brighton.')] },
      alternateNames: [], imageUrl: null, headerImageUrl: null, instagram: null, twitter: null,
      url: 'https://genius.com/artists/Royal-blood',
    });
    expect(await geniusArtistBioQueryOptions('Royal Blood').queryFn()).toEqual({ paragraphs: ['A rock duo from Brighton.'], url: 'https://genius.com/artists/Royal-blood' });
  });
});

describe('releasedLabel', () => {
  it('reads an ISO date the British way, and passes anything else through', () => {
    expect(releasedLabel('1969-09-26')).toBe('26 September 1969');
    expect(releasedLabel('2014')).toBe('2014');
    expect(releasedLabel(undefined)).toBeUndefined();
  });
});
