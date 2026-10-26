import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ARTIST_PAGE, artistQueryOptions } from '../useArtistBrowse';
import { runQueryFn } from '../../test/queryFn';
import { fetchImage } from '../../lib/imageCache';

vi.mock('../../lib/imageCache', () => ({ fetchImage: vi.fn(() => Promise.resolve(null)) }));

const mockFetch = vi.mocked(window.sonos.fetch);

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({ data: null });
});

function makeArtistResponse(overrides: Record<string, unknown> = {}) {
  return {
    title: 'The Beatles',
    images: { tile1x1: 'https://art/beatles.jpg' },
    sections: {
      items: [
        {
          items: [
            { type: 'ITEM_ALBUM', title: 'Abbey Road', resource: { id: { objectId: 'alb-1' } } },
            { type: 'ITEM_ALBUM', title: 'Let It Be', resource: { id: { objectId: 'alb-2' } } },
            { type: 'ITEM_PLAYLIST', title: 'The Beatles Radio', resource: { id: { objectId: 'pl-radio' } } },
            {
              type: 'ITEM_PLAYLIST',
              title: 'Top Songs',
              resource: { id: { objectId: 'pl-top', serviceId: 'svc', accountId: 'acc' } },
            },
          ],
        },
      ],
    },
    ...overrides,
  };
}

// ─── artistQueryOptions ───────────────────────────────────────────────────────

describe('artistQueryOptions — basic parsing', () => {
  it('parses artist name and imageUrl', async () => {
    mockFetch.mockResolvedValueOnce({ data: makeArtistResponse() });
    // Top Songs playlist fetch returns empty tracks
    mockFetch.mockResolvedValueOnce({ data: { tracks: { items: [] } } });

    const result = await runQueryFn(artistQueryOptions('art-1', 'svc', 'acc', undefined));
    expect(result.name).toBe('The Beatles');
    expect(result.imageUrl).toBe('https://art/beatles.jpg');
  });

  it('separates albums from playlists', async () => {
    mockFetch.mockResolvedValueOnce({ data: makeArtistResponse() });
    mockFetch.mockResolvedValueOnce({ data: { tracks: { items: [] } } });

    const result = await runQueryFn(artistQueryOptions('art-1', 'svc', 'acc', undefined));
    expect(result.albums).toHaveLength(2);
    expect(result.playlists).toHaveLength(1); // Radio only — Top Songs excluded
  });

  it('fetches top songs when top songs playlist is found', async () => {
    mockFetch.mockResolvedValueOnce({ data: makeArtistResponse() });
    mockFetch.mockResolvedValueOnce({
      data: {
        tracks: {
          items: [{ title: 'Come Together', duration: 'PT4M21S', images: {}, resource: { id: {} }, artists: [] }],
        },
      },
    });

    const result = await runQueryFn(artistQueryOptions('art-1', 'svc', 'acc', undefined));
    expect(result.topSongs).toHaveLength(1);
    expect(result.topSongs[0].title).toBe('Come Together');
  });

  it('returns empty topSongs when no top songs playlist', async () => {
    const noTopSongs = makeArtistResponse({
      sections: {
        items: [
          {
            items: [{ type: 'ITEM_ALBUM', title: 'Abbey Road', resource: { id: { objectId: 'alb-1' } } }],
          },
        ],
      },
    });
    mockFetch.mockResolvedValueOnce({ data: noTopSongs });

    const result = await runQueryFn(artistQueryOptions('art-1', 'svc', 'acc', undefined));
    expect(result.topSongs).toHaveLength(0);
  });

  it('throws when response has an error', async () => {
    mockFetch.mockResolvedValueOnce({ data: null, error: 'Not found' });
    await expect(runQueryFn(artistQueryOptions('art-1', 'svc', 'acc', undefined))).rejects.toThrow('Not found');
  });

  it('returns null imageUrl when images are missing', async () => {
    const noImagesNoTopSongs = makeArtistResponse({
      images: undefined,
      sections: {
        items: [{ items: [{ type: 'ITEM_ALBUM', title: 'Abbey Road', resource: { id: { objectId: 'alb-1' } } }] }],
      },
    });
    mockFetch.mockResolvedValueOnce({ data: noImagesNoTopSongs });

    const result = await runQueryFn(artistQueryOptions('art-1', 'svc', 'acc', undefined));
    expect(result.imageUrl).toBeNull();
  });
});

describe('artistQueryOptions: paging releases', () => {
  const albums = (from: number, n: number) =>
    Array.from({ length: n }, (_, i) => ({
      type: 'ITEM_ALBUM',
      title: `Album ${from + i}`,
      resource: { id: { objectId: `alb-${from + i}` } },
    }));

  it('fetches the next page while a full page has no total, and merges it', async () => {
    // The BFF leaves `total` off every page but the last.
    mockFetch.mockResolvedValueOnce({
      data: makeArtistResponse({ sections: { items: [{ items: albums(0, ARTIST_PAGE) }] } }),
    });
    mockFetch.mockResolvedValueOnce({
      data: makeArtistResponse({ sections: { items: [{ items: albums(ARTIST_PAGE, 19), total: ARTIST_PAGE + 19 }] } }),
    });

    const result = await runQueryFn(artistQueryOptions('art-1', 'svc', 'acc', undefined));
    expect(result.albums).toHaveLength(ARTIST_PAGE + 19);
    expect(result.albums[ARTIST_PAGE + 18].title).toBe(`Album ${ARTIST_PAGE + 18}`);
    expect(mockFetch.mock.calls[1][0]).toMatchObject({
      operationId: 'browseArtist',
      query: { count: String(ARTIST_PAGE), offset: String(ARTIST_PAGE) },
    });
  });

  it('stops after a short page, never asking past the end', async () => {
    mockFetch.mockResolvedValueOnce({ data: makeArtistResponse() });
    mockFetch.mockResolvedValueOnce({ data: { tracks: { items: [] } } }); // top songs
    await runQueryFn(artistQueryOptions('art-1', 'svc', 'acc', undefined));
    expect(mockFetch.mock.calls.filter(([req]) => req.operationId === 'browseArtist')).toHaveLength(1);
  });
});

describe('artistQueryOptions: hero photo', () => {
  it('starts the full-size photo before top songs and Genius have finished', async () => {
    vi.mocked(fetchImage).mockClear();
    const art = makeArtistResponse({ images: { tile1x1: 'https://art/b=w544-h544-l90-rj' } });
    mockFetch.mockResolvedValueOnce({ data: art });
    mockFetch.mockReturnValueOnce(new Promise(() => {})); // top songs never settles
    void runQueryFn(artistQueryOptions('art-1', 'svc', 'acc', undefined));
    await vi.waitFor(() => expect(fetchImage).toHaveBeenCalledWith('https://art/b=w2000-h2000-l90-rj', true));
  });
});
