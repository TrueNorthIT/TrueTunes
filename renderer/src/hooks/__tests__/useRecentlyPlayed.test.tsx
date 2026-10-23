import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { useRecentlyPlayed } from '../useRecentlyPlayed';

const mockServiceQuery = vi.fn();
const mockBrowseArtist = vi.fn();
vi.mock('../../lib/sonosApi', () => ({
  api: {
    search: { serviceQuery: (...a: unknown[]) => mockServiceQuery(...a) },
    browse: { artist: (...a: unknown[]) => mockBrowseArtist(...a) },
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

function searchResponse(...artists: { name: string; id: string; img?: string }[]) {
  return {
    error: null,
    data: {
      resourceOrder: ['ARTISTS'],
      ARTISTS: {
        resources: artists.map((a) => ({
          name: a.name,
          id: { objectId: a.id, serviceId: 'svc', accountId: 'acc' },
          images: a.img ? [{ url: a.img }] : [],
        })),
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(window.sonos.getDisplayName).mockResolvedValue('Rich');
  mockBrowseArtist.mockResolvedValue({ error: null, data: { images: { tile1x1: 'primary-photo' } } });
});

describe('useRecentlyPlayed artist tiles', () => {
  it('resolves an id-less artist by exact (case-insensitive) name via search', async () => {
    vi.mocked(window.sonos.fetchRecentlyPlayed).mockResolvedValue({
      tracks: [],
      albums: [],
      artists: [
        { artist: 'Sub Focus', serviceId: 'svc', accountId: 'acc', artistId: 'sf', lastPlayed: 2 },
        { artist: 'Inéz', serviceId: 'svc', accountId: 'acc', lastPlayed: 1 },
      ],
    } as never);
    mockServiceQuery.mockResolvedValue(
      searchResponse({ name: 'Inez Remix Band', id: 'wrong' }, { name: 'inéz', id: 'inez-id', img: 'inez-photo' })
    );

    const { result } = renderHook(() => useRecentlyPlayed('Rich'), { wrapper });

    await waitFor(() => {
      const inez = result.current.artistItems.find((a) => a.name === 'Inéz');
      expect(inez?.resource?.id).toMatchObject({ objectId: 'inez-id' });
      expect(inez?.imageUrl).toBe('inez-photo');
    });
    expect(mockServiceQuery).toHaveBeenCalledWith(
      'Inéz',
      expect.objectContaining({ serviceId: 'svc', accountId: 'acc' })
    );
    // The primary already has an id and is not searched for.
    expect(mockServiceQuery).toHaveBeenCalledTimes(1);
  });

  it('leaves the tile id-less (never an id from a non-matching result) when nothing matches exactly', async () => {
    vi.mocked(window.sonos.fetchRecentlyPlayed).mockResolvedValue({
      tracks: [],
      albums: [],
      artists: [{ artist: 'Katy B', serviceId: 'svc', accountId: 'acc', lastPlayed: 1 }],
    } as never);
    mockServiceQuery.mockResolvedValue(searchResponse({ name: 'Katy Perry', id: 'kp' }));

    const { result } = renderHook(() => useRecentlyPlayed('Rich'), { wrapper });

    await waitFor(() => expect(mockServiceQuery).toHaveBeenCalled());
    await waitFor(() => expect(result.current.artistItems).toHaveLength(1));
    expect(result.current.artistItems[0].resource?.id).toMatchObject({ objectId: undefined });
    expect(result.current.artistItems[0].imageUrl).toBeUndefined();
  });
});
