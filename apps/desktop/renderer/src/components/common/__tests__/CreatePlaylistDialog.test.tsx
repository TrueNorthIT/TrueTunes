import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreatePlaylistDialog } from '../ContextMenu';

function makeQc() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

const DISPLAY_NAME = 'Alice';
const NEW_PLAYLIST: PlaylistDoc = {
  id: 'new-playlist-id',
  name: 'Road Trip',
  owner: DISPLAY_NAME,
  isPublic: false,
  isFavourites: false,
  members: [DISPLAY_NAME],
  memberCount: 1,
  trackCount: 0,
  tracks: [],
  createdAt: 0,
  updatedAt: 0,
};

const PENDING_TRACK: PlaylistTrack = {
  uri: 'x-sonos-spotify:spotify:track:xyz',
  trackName: 'Desert Rose',
  artist: 'Sting',
  imageUrl: null,
  serviceId: 'gm',
  accountId: 'acc1',
  addedBy: DISPLAY_NAME,
  addedAt: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
});

function renderDialog(pendingTrack: PlaylistTrack | null, onClose = vi.fn()) {
  const qc = makeQc();
  render(
    createElement(
      QueryClientProvider,
      { client: qc },
      createElement(CreatePlaylistDialog, { displayName: DISPLAY_NAME, pendingTrack, onClose }),
    ),
  );
  return { qc, onClose };
}

describe('CreatePlaylistDialog', () => {
  it('creates playlist without adding a track when pendingTrack is null', async () => {
    const user = userEvent.setup();
    vi.mocked(window.sonos.createPlaylist).mockResolvedValueOnce(NEW_PLAYLIST);
    vi.mocked(window.sonos.addTrackToPlaylist).mockResolvedValueOnce({} as PlaylistDoc);

    const { onClose } = renderDialog(null);

    await user.type(screen.getByPlaceholderText('Playlist name'), 'Road Trip');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(vi.mocked(window.sonos.createPlaylist)).toHaveBeenCalledWith('Road Trip', false);
    expect(vi.mocked(window.sonos.addTrackToPlaylist)).not.toHaveBeenCalled();
  });

  it('adds pendingTrack to the new playlist after creation', async () => {
    const user = userEvent.setup();
    vi.mocked(window.sonos.createPlaylist).mockResolvedValueOnce(NEW_PLAYLIST);
    vi.mocked(window.sonos.addTrackToPlaylist).mockResolvedValueOnce({} as PlaylistDoc);

    renderDialog(PENDING_TRACK);

    await user.type(screen.getByPlaceholderText('Playlist name'), 'Road Trip');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(vi.mocked(window.sonos.addTrackToPlaylist)).toHaveBeenCalledWith(
        NEW_PLAYLIST.id,
        PENDING_TRACK,
      );
    });
  });

  it('shows inline error and stays open when server rejects', async () => {
    const user = userEvent.setup();
    vi.mocked(window.sonos.createPlaylist).mockRejectedValueOnce(new Error('Name too long'));

    const { onClose } = renderDialog(null);

    await user.type(screen.getByPlaceholderText('Playlist name'), 'Road Trip');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => screen.getByText('Name too long'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
