import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PlaylistPanel } from '../PlaylistPanel';
import type { SonosItem } from '../../types/sonos';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useParams: () => ({ id: PLAYLIST_ID }),
  useNavigate: () => mockNavigate,
}));

vi.mock('../../hooks/useImage', () => ({
  useImage: () => null,
}));

vi.mock('../../hooks/useTrackDetails', () => ({
  useTrackDetails: () => ({ data: null }),
}));

const mockShowTrackMenu = vi.fn();
vi.mock('../common/ContextMenu', () => ({
  useTrackContextMenu: () => ({ showTrackMenu: mockShowTrackMenu }),
}));

const mockShowToast = vi.fn();
vi.mock('../common/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const PLAYLIST_ID = 'playlist-1';
const OWNER = 'Alice';
const TRACK_URI = 'x-sonos-spotify:spotify:track:abc123';

function makeTrack(): PlaylistTrack {
  return {
    uri: TRACK_URI,
    trackName: 'Test Track',
    artist: 'Test Artist',
    imageUrl: null,
    serviceId: 'gm',
    accountId: 'acc1',
    addedBy: OWNER,
    addedAt: 0,
  };
}

function makePlaylist(tracks: PlaylistTrack[] = []): PlaylistDoc {
  return {
    id: PLAYLIST_ID,
    name: 'My Playlist',
    owner: OWNER,
    isPublic: false,
    isFavourites: false,
    members: [OWNER],
    memberCount: 1,
    trackCount: tracks.length,
    tracks,
    createdAt: 1000,
    updatedAt: 1000,
  };
}

function renderPanel(qc: QueryClient) {
  return render(
    createElement(
      QueryClientProvider,
      { client: qc },
      createElement(PlaylistPanel, {
        displayName: OWNER,
        onAddToQueue: vi.fn() as (item: SonosItem, position?: number) => void,
      }),
    ),
  );
}

function makeQc() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('handleRemoveTrack', () => {
  it('calls removeTrackFromPlaylist with correct args and removes track from cache', async () => {
    const qc = makeQc();
    qc.setQueryData(['playlist', PLAYLIST_ID], makePlaylist([makeTrack()]));
    vi.mocked(window.sonos.removeTrackFromPlaylist).mockResolvedValueOnce({} as PlaylistDoc);

    renderPanel(qc);

    const removeBtn = await screen.findByTitle('Remove');
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(vi.mocked(window.sonos.removeTrackFromPlaylist)).toHaveBeenCalledWith(
        PLAYLIST_ID,
        TRACK_URI,
      );
    });

    const updated = qc.getQueryData<PlaylistDoc>(['playlist', PLAYLIST_ID]);
    expect(updated?.tracks).toHaveLength(0);
  });

  it('restores cache and shows toast when server rejects', async () => {
    const qc = makeQc();
    qc.setQueryData(['playlist', PLAYLIST_ID], makePlaylist([makeTrack()]));
    vi.mocked(window.sonos.removeTrackFromPlaylist).mockRejectedValueOnce(new Error('network'));

    renderPanel(qc);

    const removeBtn = await screen.findByTitle('Remove');
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Failed to remove track');
    });

    const restored = qc.getQueryData<PlaylistDoc>(['playlist', PLAYLIST_ID]);
    expect(restored?.tracks).toHaveLength(1);
  });
});
