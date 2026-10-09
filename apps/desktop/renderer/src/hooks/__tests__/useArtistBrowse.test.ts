import { describe, it, expect, vi, beforeEach } from 'vitest';
import { artistQueryOptions } from '../useArtistBrowse';

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
      items: [{
        items: [
          { type: 'ITEM_ALBUM', title: 'Abbey Road', resource: { id: { objectId: 'alb-1' } } },
          { type: 'ITEM_ALBUM', title: 'Let It Be',  resource: { id: { objectId: 'alb-2' } } },
          { type: 'ITEM_PLAYLIST', title: 'The Beatles Radio', resource: { id: { objectId: 'pl-radio' } } },
          {
            type: 'ITEM_PLAYLIST',
            title: 'Top Songs',
            resource: { id: { objectId: 'pl-top', serviceId: 'svc', accountId: 'acc' } },
          },
        ],
      }],
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

    const result = await artistQueryOptions('art-1', 'svc', 'acc', undefined).queryFn();
    expect(result.name).toBe('The Beatles');
    expect(result.imageUrl).toBe('https://art/beatles.jpg');
  });

  it('separates albums from playlists', async () => {
    mockFetch.mockResolvedValueOnce({ data: makeArtistResponse() });
    mockFetch.mockResolvedValueOnce({ data: { tracks: { items: [] } } });

    const result = await artistQueryOptions('art-1', 'svc', 'acc', undefined).queryFn();
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

    const result = await artistQueryOptions('art-1', 'svc', 'acc', undefined).queryFn();
    expect(result.topSongs).toHaveLength(1);
    expect(result.topSongs[0].title).toBe('Come Together');
  });

  it('returns empty topSongs when no top songs playlist', async () => {
    const noTopSongs = makeArtistResponse({
      sections: {
        items: [{
          items: [
            { type: 'ITEM_ALBUM', title: 'Abbey Road', resource: { id: { objectId: 'alb-1' } } },
          ],
        }],
      },
    });
    mockFetch.mockResolvedValueOnce({ data: noTopSongs });

    const result = await artistQueryOptions('art-1', 'svc', 'acc', undefined).queryFn();
    expect(result.topSongs).toHaveLength(0);
  });

  it('throws when response has an error', async () => {
    mockFetch.mockResolvedValueOnce({ data: null, error: 'Not found' });
    await expect(
      artistQueryOptions('art-1', 'svc', 'acc', undefined).queryFn()
    ).rejects.toThrow('Not found');
  });

  it('returns null imageUrl when images are missing', async () => {
    const noImagesNoTopSongs = makeArtistResponse({
      images: undefined,
      sections: { items: [{ items: [{ type: 'ITEM_ALBUM', title: 'Abbey Road', resource: { id: { objectId: 'alb-1' } } }] }] },
    });
    mockFetch.mockResolvedValueOnce({ data: noImagesNoTopSongs });

    const result = await artistQueryOptions('art-1', 'svc', 'acc', undefined).queryFn();
    expect(result.imageUrl).toBeNull();
  });
});
