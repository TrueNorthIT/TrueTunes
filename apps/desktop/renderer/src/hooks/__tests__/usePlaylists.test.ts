import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFavourite, useEnsureFavourites, favouritesId } from '../usePlaylists';

const mockShowToast = vi.fn();
vi.mock('../../components/common/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

function makeWrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

function makeQc() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

const DISPLAY_NAME = 'Alice';
const TRACK_URI = 'x-sonos-spotify:spotify:track:abc123';

const sampleTrack = {
  uri: TRACK_URI,
  trackName: 'Test Track',
  artist: 'Test Artist',
  albumName: 'Test Album',
  imageUrl: null as null,
  serviceId: 'gm',
  accountId: 'acc1',
};

function makePlaylistTrack(): PlaylistTrack {
  return {
    uri: TRACK_URI,
    trackName: 'Test Track',
    artist: 'Test Artist',
    imageUrl: null,
    serviceId: 'gm',
    accountId: 'acc1',
    addedBy: DISPLAY_NAME,
    addedAt: 0,
  };
}

function makeFavPlaylist(tracks: PlaylistTrack[] = []): PlaylistDoc {
  const id = favouritesId(DISPLAY_NAME);
  return {
    id,
    name: 'Favourites',
    owner: DISPLAY_NAME,
    isPublic: false,
    isFavourites: true,
    members: [DISPLAY_NAME],
    memberCount: 1,
    trackCount: tracks.length,
    tracks,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('useFavourite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns isFavourited=false when playlist is not in cache', () => {
    const qc = makeQc();
    const { result } = renderHook(
      () => useFavourite(DISPLAY_NAME, sampleTrack),
      { wrapper: makeWrapper(qc) },
    );
    expect(result.current.isFavourited).toBe(false);
  });

  it('returns isFavourited=true when track uri matches cached playlist', () => {
    const qc = makeQc();
    const favId = favouritesId(DISPLAY_NAME);
    qc.setQueryData(['playlist', favId], makeFavPlaylist([makePlaylistTrack()]));

    const { result } = renderHook(
      () => useFavourite(DISPLAY_NAME, sampleTrack),
      { wrapper: makeWrapper(qc) },
    );
    expect(result.current.isFavourited).toBe(true);
  });

  it('toggle add: calls addTrackToPlaylist and updates cache optimistically', async () => {
    const qc = makeQc();
    const favId = favouritesId(DISPLAY_NAME);
    qc.setQueryData(['playlist', favId], makeFavPlaylist());
    vi.mocked(window.sonos.addTrackToPlaylist).mockResolvedValueOnce({} as PlaylistDoc);

    const { result } = renderHook(
      () => useFavourite(DISPLAY_NAME, sampleTrack),
      { wrapper: makeWrapper(qc) },
    );

    await act(() => result.current.toggle());

    expect(vi.mocked(window.sonos.addTrackToPlaylist)).toHaveBeenCalledWith(
      favId,
      expect.objectContaining({ uri: TRACK_URI, addedBy: DISPLAY_NAME }),
    );
    const updated = qc.getQueryData<PlaylistDoc>(['playlist', favId]);
    expect(updated?.tracks).toHaveLength(1);
    expect(updated?.tracks[0].uri).toBe(TRACK_URI);
  });

  it('toggle add rollback: restores cache and shows toast when server fails', async () => {
    const qc = makeQc();
    const favId = favouritesId(DISPLAY_NAME);
    qc.setQueryData(['playlist', favId], makeFavPlaylist());
    vi.mocked(window.sonos.addTrackToPlaylist).mockRejectedValueOnce(new Error('network'));

    const { result } = renderHook(
      () => useFavourite(DISPLAY_NAME, sampleTrack),
      { wrapper: makeWrapper(qc) },
    );

    await act(() => result.current.toggle());

    const restored = qc.getQueryData<PlaylistDoc>(['playlist', favId]);
    expect(restored?.tracks).toHaveLength(0);
    expect(mockShowToast).toHaveBeenCalledWith('Failed to add to Favourites');
  });

  it('toggle remove: calls removeTrackFromPlaylist and removes from cache', async () => {
    const qc = makeQc();
    const favId = favouritesId(DISPLAY_NAME);
    qc.setQueryData(['playlist', favId], makeFavPlaylist([makePlaylistTrack()]));
    vi.mocked(window.sonos.removeTrackFromPlaylist).mockResolvedValueOnce({} as PlaylistDoc);

    const { result } = renderHook(
      () => useFavourite(DISPLAY_NAME, sampleTrack),
      { wrapper: makeWrapper(qc) },
    );

    expect(result.current.isFavourited).toBe(true);
    await act(() => result.current.toggle());

    expect(vi.mocked(window.sonos.removeTrackFromPlaylist)).toHaveBeenCalledWith(favId, TRACK_URI);
    const updated = qc.getQueryData<PlaylistDoc>(['playlist', favId]);
    expect(updated?.tracks).toHaveLength(0);
  });

  it('toggle remove rollback: restores cache and shows toast when server fails', async () => {
    const qc = makeQc();
    const favId = favouritesId(DISPLAY_NAME);
    qc.setQueryData(['playlist', favId], makeFavPlaylist([makePlaylistTrack()]));
    vi.mocked(window.sonos.removeTrackFromPlaylist).mockRejectedValueOnce(new Error('network'));

    const { result } = renderHook(
      () => useFavourite(DISPLAY_NAME, sampleTrack),
      { wrapper: makeWrapper(qc) },
    );

    expect(result.current.isFavourited).toBe(true);
    await act(() => result.current.toggle());

    const restored = qc.getQueryData<PlaylistDoc>(['playlist', favId]);
    expect(restored?.tracks).toHaveLength(1);
    expect(mockShowToast).toHaveBeenCalledWith('Failed to remove from Favourites');
  });
});

describe('useEnsureFavourites', () => {
  it('registers query with staleTime=5 minutes and retry=2', () => {
    const qc = new QueryClient();
    renderHook(() => useEnsureFavourites(DISPLAY_NAME), { wrapper: makeWrapper(qc) });
    const query = qc.getQueryCache().find({ queryKey: ['favourites-ensure', DISPLAY_NAME] });
    const opts = query?.options as { staleTime?: number; retry?: number | boolean | null } | undefined;
    expect(opts?.staleTime).toBe(5 * 60_000);
    expect(opts?.retry).toBe(2);
  });
});
