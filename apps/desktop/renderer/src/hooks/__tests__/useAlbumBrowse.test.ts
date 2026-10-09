import { describe, it, expect, vi, beforeEach } from 'vitest';
import { albumQueryOptions } from '../useAlbumBrowse';

const mockFetch = vi.mocked(window.sonos.fetch);

beforeEach(() => {
  mockFetch.mockReset();
});

function encodeDefaults(obj: Record<string, unknown>) {
  return btoa(JSON.stringify(obj));
}

function makeTrack(title: string, ordinal = 1) {
  return {
    title,
    ordinal,
    duration: '180',
    images: { tile1x1: `http://art/${title}.jpg` },
    resource: { id: { objectId: `obj-${title}`, serviceId: 'gm', accountId: 'acc' }, defaults: '' },
    artists: [{ id: 'art-1', name: 'The Beatles' }],
    isExplicit: false,
  };
}

function makeAlbumResponse(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Abbey Road',
    subtitle: 'The Beatles',
    images: { tile1x1: 'http://art/album.jpg' },
    resource: { id: { objectId: 'alb-1', serviceId: 'gm', accountId: 'acc' }, defaults: undefined },
    tracks: { items: [makeTrack('Come Together', 1), makeTrack('Something', 2)], total: 2 },
    ...overrides,
  };
}

// ─── Basic parsing ────────────────────────────────────────────────────────────

describe('albumQueryOptions — basic parsing', () => {
  it('parses album title, artist, and artUrl from response', async () => {
    mockFetch.mockResolvedValueOnce({ data: makeAlbumResponse() });
    const result = await albumQueryOptions('alb-1', 'gm', 'acc', undefined).queryFn();
    expect(result.title).toBe('Abbey Road');
    expect(result.artist).toBe('The Beatles');
    expect(result.artUrl).toBe('http://art/album.jpg');
  });

  it('returns the correct track count', async () => {
    mockFetch.mockResolvedValueOnce({ data: makeAlbumResponse() });
    const result = await albumQueryOptions('alb-1', 'gm', 'acc', undefined).queryFn();
    expect(result.tracks).toHaveLength(2);
    expect(result.totalTracks).toBe(2);
  });

  it('maps track title, ordinal, and duration', async () => {
    mockFetch.mockResolvedValueOnce({ data: makeAlbumResponse() });
    const result = await albumQueryOptions('alb-1', 'gm', 'acc', undefined).queryFn();
    expect(result.tracks[0].title).toBe('Come Together');
    expect(result.tracks[0].ordinal).toBe(1);
    expect(result.tracks[0].durationSeconds).toBe(180);
  });

  it('maps track artists array', async () => {
    mockFetch.mockResolvedValueOnce({ data: makeAlbumResponse() });
    const result = await albumQueryOptions('alb-1', 'gm', 'acc', undefined).queryFn();
    expect(result.tracks[0].artists).toEqual(['The Beatles']);
  });

  it('maps track explicit flag', async () => {
    const explicit = makeTrack('Explicit Song');
    explicit.isExplicit = true;
    mockFetch.mockResolvedValueOnce({
      data: makeAlbumResponse({ tracks: { items: [explicit], total: 1 } }),
    });
    const result = await albumQueryOptions('alb-1', 'gm', 'acc', undefined).queryFn();
    expect(result.tracks[0].explicit).toBe(true);
  });
});

// ─── artistItem construction ──────────────────────────────────────────────────

describe('artistItem construction', () => {
  it('builds artistItem when defaults contain artistId', async () => {
    const defaults = encodeDefaults({ artistId: 'art-beatles', artist: 'The Beatles' });
    mockFetch.mockResolvedValueOnce({
      data: makeAlbumResponse({
        resource: { id: { objectId: 'alb-1', serviceId: 'gm', accountId: 'acc' }, defaults },
      }),
    });
    const result = await albumQueryOptions('alb-1', 'gm', 'acc', undefined).queryFn();
    expect(result.artistItem).not.toBeNull();
    expect(result.artistItem?.resource?.id?.objectId).toBe('art-beatles');
  });

  it('returns null artistItem when defaults has no artistId', async () => {
    mockFetch.mockResolvedValueOnce({ data: makeAlbumResponse() });
    const result = await albumQueryOptions('alb-1', 'gm', 'acc', undefined).queryFn();
    expect(result.artistItem).toBeNull();
  });
});

// ─── Pagination ───────────────────────────────────────────────────────────────

describe('pagination', () => {
  it('fetches additional pages when total > initial page size', async () => {
    const page1Tracks = Array.from({ length: 50 }, (_, i) => makeTrack(`Track ${i + 1}`, i + 1));
    const page2Tracks = [makeTrack('Track 51', 51)];

    mockFetch
      .mockResolvedValueOnce({
        data: makeAlbumResponse({ tracks: { items: page1Tracks, total: 51 } }),
      })
      .mockResolvedValueOnce({
        data: { tracks: { items: page2Tracks, total: 51 } },
      });

    const result = await albumQueryOptions('alb-1', 'gm', 'acc', undefined).queryFn();
    expect(result.tracks).toHaveLength(51);
    expect(result.tracks[50].title).toBe('Track 51');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('does not fetch a second page when total equals initial page count', async () => {
    const tracks = Array.from({ length: 3 }, (_, i) => makeTrack(`T${i}`, i));
    mockFetch.mockResolvedValueOnce({
      data: makeAlbumResponse({ tracks: { items: tracks, total: 3 } }),
    });

    await albumQueryOptions('alb-1', 'gm', 'acc', undefined).queryFn();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('stops pagination when next page returns empty items', async () => {
    const page1 = Array.from({ length: 3 }, (_, i) => makeTrack(`T${i}`, i));

    // total claims 10 but subsequent page is empty — should stop
    mockFetch
      .mockResolvedValueOnce({
        data: makeAlbumResponse({ tracks: { items: page1, total: 10 } }),
      })
      .mockResolvedValueOnce({ data: { tracks: { items: [], total: 10 } } });

    const result = await albumQueryOptions('alb-1', 'gm', 'acc', undefined).queryFn();
    expect(result.tracks).toHaveLength(3);
  });

  it('stops pagination when subsequent page fetch errors', async () => {
    const page1 = Array.from({ length: 3 }, (_, i) => makeTrack(`T${i}`, i));

    mockFetch
      .mockResolvedValueOnce({
        data: makeAlbumResponse({ tracks: { items: page1, total: 10 } }),
      })
      .mockResolvedValueOnce({ data: null, error: 'server error' });

    const result = await albumQueryOptions('alb-1', 'gm', 'acc', undefined).queryFn();
    expect(result.tracks).toHaveLength(3);
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe('error handling', () => {
  it('throws when the first fetch returns an error', async () => {
    mockFetch.mockResolvedValueOnce({ data: null, error: 'not found' });
    await expect(albumQueryOptions('alb-1', 'gm', 'acc', undefined).queryFn()).rejects.toThrow('not found');
  });
});
