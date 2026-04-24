import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { useQueueTrack } from '../useQueueTrack';
import type { QueueItem } from '../../types/sonos';

const mockTrackDetails = vi.fn();
vi.mock('../useTrackDetails', () => ({
  useTrackDetails: (...args: unknown[]) => mockTrackDetails(...args),
}));
vi.mock('../useAlbumBrowse', () => ({ albumQueryOptions: vi.fn() }));
vi.mock('../useArtistBrowse', () => ({ artistQueryOptions: vi.fn() }));

function wrapper({ children }: { children: React.ReactNode }) {
  return createElement(QueryClientProvider, { client: new QueryClient() }, children);
}

const baseItem: QueueItem = {
  name: 'Come Together',
  type: 'TRACK',
  track: {
    name: 'Come Together',
    id: { objectId: 'obj-1', serviceId: 'svc-1', accountId: 'acc-1' },
    explicit: false,
  } as QueueItem['track'],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockTrackDetails.mockReturnValue({ data: undefined });
});

describe('useQueueTrack', () => {
  it('returns artist and artUrl from item when no track details', () => {
    const { result } = renderHook(
      () => useQueueTrack(baseItem, null),
      { wrapper }
    );
    expect(result.current.artist).toBeDefined();
    expect(result.current.explicit).toBe(false);
  });

  it('prefers track details over raw item values', () => {
    mockTrackDetails.mockReturnValue({
      data: { artist: 'Enriched Artist', artUrl: 'http://img.com/art.jpg', albumName: 'Abbey Road', albumId: null, serviceId: null, accountId: null, artistId: null },
    });
    const { result } = renderHook(
      () => useQueueTrack(baseItem, null),
      { wrapper }
    );
    expect(result.current.artist).toBe('Enriched Artist');
    expect(result.current.artUrl).toBe('http://img.com/art.jpg');
  });

  it('isPlaying is true when currentObjectId matches item objectId', () => {
    const { result } = renderHook(
      () => useQueueTrack(baseItem, 'obj-1'),
      { wrapper }
    );
    expect(result.current.isPlaying).toBe(true);
  });

  it('isPlaying is false when currentObjectId does not match', () => {
    const { result } = renderHook(
      () => useQueueTrack(baseItem, 'other-obj'),
      { wrapper }
    );
    expect(result.current.isPlaying).toBe(false);
  });

  it('returns albumItem when albumId and albumName available in track details', () => {
    mockTrackDetails.mockReturnValue({
      data: {
        artist: 'Artist',
        artUrl: null,
        albumName: 'Abbey Road',
        albumId: 'alb-1',
        serviceId: 'svc-1',
        accountId: 'acc-1',
        artistId: null,
      },
    });
    const { result } = renderHook(
      () => useQueueTrack(baseItem, null),
      { wrapper }
    );
    expect(result.current.albumItem).not.toBeNull();
    expect(result.current.albumItem?.title).toBe('Abbey Road');
  });

  it('returns null albumItem when albumId is missing', () => {
    mockTrackDetails.mockReturnValue({
      data: { artist: 'Artist', artUrl: null, albumName: null, albumId: null, serviceId: null, accountId: null, artistId: null },
    });
    const { result } = renderHook(
      () => useQueueTrack(baseItem, null),
      { wrapper }
    );
    expect(result.current.albumItem).toBeNull();
  });

  it('returns artistItem when artistId available in track details', () => {
    mockTrackDetails.mockReturnValue({
      data: {
        artist: 'The Beatles',
        artUrl: null,
        albumName: null,
        albumId: null,
        serviceId: 'svc-1',
        accountId: 'acc-1',
        artistId: 'artist-1',
      },
    });
    const { result } = renderHook(
      () => useQueueTrack(baseItem, null),
      { wrapper }
    );
    expect(result.current.artistItem).not.toBeNull();
    expect(result.current.artistItem?.name).toBe('The Beatles');
  });

  it('returns null artistItem when artistId is missing', () => {
    const { result } = renderHook(
      () => useQueueTrack(baseItem, null),
      { wrapper }
    );
    expect(result.current.artistItem).toBeNull();
  });

  it('explicit is true when track.explicit is set', () => {
    const explicitItem: QueueItem = {
      ...baseItem,
      track: { ...baseItem.track, explicit: true } as QueueItem['track'],
    };
    const { result } = renderHook(
      () => useQueueTrack(explicitItem, null),
      { wrapper }
    );
    expect(result.current.explicit).toBe(true);
  });
});
