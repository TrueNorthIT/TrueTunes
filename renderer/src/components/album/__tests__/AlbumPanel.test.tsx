import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlbumPanel } from '../AlbumPanel';
import type { SonosItem } from '../../../types/sonos';
import { queueActionsWrapper } from '../../../test/queueActions';

const mockUseLocation = vi.fn();
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useLocation: () => mockUseLocation(),
  useNavigate: () => mockNavigate,
}));

const mockUseImage = vi.fn();
vi.mock('../../../hooks/useImage', () => ({ useImage: (...a: unknown[]) => mockUseImage(...a) }));

const mockUseDominantColor = vi.fn();
vi.mock('../../../hooks/useDominantColor', () => ({
  useDominantColor: (...a: unknown[]) => mockUseDominantColor(...a),
}));

vi.mock('../../../hooks/useArtistBrowse', () => ({
  artistBrowseQueryOptions: vi.fn(() => ({ queryKey: [], queryFn: async () => null })),
}));

const mockUseAlbumBrowse = vi.fn();
vi.mock('../../../hooks/useAlbumBrowse', () => ({
  useAlbumBrowse: (...args: unknown[]) => mockUseAlbumBrowse(...args),
  albumQueryOptions: vi.fn(() => ({ queryKey: [], queryFn: async () => null })),
}));
const mockUsePlaylistBrowse = vi.fn();
vi.mock('../../../hooks/usePlaylistBrowse', () => ({
  usePlaylistBrowse: (...args: unknown[]) => mockUsePlaylistBrowse(...args),
}));

vi.mock('../AlbumTrackRow', () => ({
  AlbumTrackRow: ({
    track,
    isSelected,
    onClick,
    onAdd,
  }: {
    track: { title: string; id: { objectId: string } };
    isSelected: boolean;
    onClick: (e: React.MouseEvent) => void;
    onAdd: () => void;
  }) => (
    <div data-testid={track.id.objectId} data-selected={isSelected} onClick={onClick}>
      {track.title}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onAdd();
        }}
      >
        Add
      </button>
    </div>
  ),
}));

function makeTrack(title: string, idx: number, durationSeconds = 210) {
  return {
    title,
    ordinal: idx + 1,
    durationSeconds,
    artist: 'Artist',
    artistId: null,
    albumName: null,
    albumId: null,
    artUrl: null,
    id: { objectId: `trk-${idx}`, serviceId: 'svc', accountId: 'acc' },
    raw: { name: title, type: 'TRACK' } as SonosItem,
    explicit: false,
  };
}

const albumItem: SonosItem = {
  title: 'Abbey Road',
  type: 'ITEM_ALBUM',
  resource: {
    type: 'ALBUM',
    id: { objectId: 'alb-1', serviceId: 'svc-1', accountId: 'acc-1' },
  },
} as SonosItem;

const playlistItem: SonosItem = {
  title: 'My Playlist',
  type: 'PLAYLIST',
  resource: {
    type: 'PLAYLIST',
    id: { objectId: 'pl-1', serviceId: 'svc-1', accountId: 'acc-1' },
  },
} as SonosItem;

function makeAlbumData(overrides = {}) {
  return {
    title: 'Abbey Road',
    artist: 'The Beatles',
    artUrl: null,
    totalTracks: 2,
    tracks: [makeTrack('Come Together', 0), makeTrack('Something', 1)],
    artistItem: null,
    ...overrides,
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  return createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
    children
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseImage.mockReturnValue(null);
  mockUseDominantColor.mockReturnValue(null);
  mockUseLocation.mockReturnValue({ state: { item: albumItem } });
  mockUseAlbumBrowse.mockReturnValue({ data: makeAlbumData(), isLoading: false, error: null });
  mockUsePlaylistBrowse.mockReturnValue({ data: undefined, isLoading: false, error: null });
});

describe('AlbumPanel', () => {
  // ── basic rendering ───────────────────────────────────────────────────────

  it('returns nothing when no item in state', () => {
    mockUseLocation.mockReturnValue({ state: null });
    const { container } = render(<AlbumPanel />, { wrapper });
    expect(container.firstChild).toBeNull();
  });

  it('shows album title', () => {
    render(<AlbumPanel />, { wrapper });
    expect(screen.getByText('Abbey Road')).toBeInTheDocument();
  });

  it('shows artist name', () => {
    render(<AlbumPanel />, { wrapper });
    expect(screen.getByText('The Beatles')).toBeInTheDocument();
  });

  it('renders track list', () => {
    render(<AlbumPanel />, { wrapper });
    expect(screen.getByText('Come Together')).toBeInTheDocument();
    expect(screen.getByText('Something')).toBeInTheDocument();
  });

  it('shows loading skeletons while loading', () => {
    mockUseAlbumBrowse.mockReturnValue({ data: undefined, isLoading: true, error: null });
    const { container } = render(<AlbumPanel />, { wrapper });
    expect(container.querySelectorAll('[class*="skeletonRow"]').length).toBeGreaterThan(0);
  });

  it('shows error message when fetch fails, with a retry', () => {
    const refetch = vi.fn();
    mockUseAlbumBrowse.mockReturnValue({ data: undefined, isLoading: false, error: new Error('fail'), refetch });
    render(<AlbumPanel />, { wrapper });
    expect(screen.getByText('Failed to load tracks.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('shows no tracks message when empty', () => {
    mockUseAlbumBrowse.mockReturnValue({
      data: makeAlbumData({ tracks: [], totalTracks: 0 }),
      isLoading: false,
      error: null,
    });
    render(<AlbumPanel />, { wrapper });
    expect(screen.getByText('No tracks found.')).toBeInTheDocument();
  });

  it('shows track count and duration', () => {
    render(<AlbumPanel />, { wrapper });
    expect(screen.getByText(/2 songs/)).toBeInTheDocument();
    expect(screen.getByText(/7 min/)).toBeInTheDocument();
  });

  it('shows only song count when total duration is 0', () => {
    const tracks = [makeTrack('Song A', 0, 0), makeTrack('Song B', 1, 0)];
    mockUseAlbumBrowse.mockReturnValue({
      data: makeAlbumData({ tracks, totalTracks: 2 }),
      isLoading: false,
      error: null,
    });
    render(<AlbumPanel />, { wrapper });
    const metaLine = screen.getByText(/2 songs/);
    expect(metaLine.textContent).not.toContain('min');
  });

  // ── display ───────────────────────────────────────────────────────────────

  it('shows art image when useImage returns a URL', () => {
    mockUseImage.mockReturnValue('http://img.com/art.jpg');
    const { container } = render(<AlbumPanel />, { wrapper });
    expect(container.querySelector('img[src="http://img.com/art.jpg"]')).toBeTruthy();
  });

  it('applies gradient background when dominant color is set', () => {
    mockUseDominantColor.mockReturnValue('200, 100, 50');
    const { container } = render(<AlbumPanel />, { wrapper });
    const header = container.querySelector('[class*="header"]') as HTMLElement;
    expect(header?.style.background).toContain('200, 100, 50');
  });

  // ── add to queue ──────────────────────────────────────────────────────────

  it('add to queue button calls onAddToQueue once with the album item (handler fans out per-track)', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<AlbumPanel />, { wrapper: queueActionsWrapper(onAdd, wrapper) });
    await user.click(screen.getByRole('button', { name: 'Add to queue' }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    expect(onAdd).toHaveBeenCalledWith(albumItem);
  });

  it('clicking Add on a track row calls onAddToQueue with that track raw', () => {
    const onAdd = vi.fn();
    render(<AlbumPanel />, { wrapper: queueActionsWrapper(onAdd, wrapper) });
    fireEvent.click(screen.getAllByText('Add')[0]);
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ name: 'Come Together' }));
  });

  // ── track selection ───────────────────────────────────────────────────────

  it('single-clicking a track selects it', () => {
    render(<AlbumPanel />, { wrapper });
    fireEvent.click(screen.getByTestId('trk-0'));
    expect(screen.getByTestId('trk-0')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('trk-1')).toHaveAttribute('data-selected', 'false');
  });

  it('clicking a selected track deselects it', () => {
    render(<AlbumPanel />, { wrapper });
    fireEvent.click(screen.getByTestId('trk-0'));
    fireEvent.click(screen.getByTestId('trk-0'));
    expect(screen.getByTestId('trk-0')).toHaveAttribute('data-selected', 'false');
  });

  it('ctrl+click adds another track to selection', () => {
    render(<AlbumPanel />, { wrapper });
    fireEvent.click(screen.getByTestId('trk-0'));
    fireEvent.click(screen.getByTestId('trk-1'), { ctrlKey: true });
    expect(screen.getByTestId('trk-0')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('trk-1')).toHaveAttribute('data-selected', 'true');
  });

  it('ctrl+click on a selected track removes it from selection', () => {
    render(<AlbumPanel />, { wrapper });
    fireEvent.click(screen.getByTestId('trk-0'));
    fireEvent.click(screen.getByTestId('trk-1'), { ctrlKey: true });
    fireEvent.click(screen.getByTestId('trk-0'), { ctrlKey: true });
    expect(screen.getByTestId('trk-0')).toHaveAttribute('data-selected', 'false');
    expect(screen.getByTestId('trk-1')).toHaveAttribute('data-selected', 'true');
  });

  it('shift+click range-selects from last to target', () => {
    const tracks = Array.from({ length: 4 }, (_, i) => makeTrack(`Song ${i}`, i));
    mockUseAlbumBrowse.mockReturnValue({
      data: makeAlbumData({ tracks, totalTracks: 4 }),
      isLoading: false,
      error: null,
    });
    render(<AlbumPanel />, { wrapper });
    fireEvent.click(screen.getByTestId('trk-0'));
    fireEvent.click(screen.getByTestId('trk-2'), { shiftKey: true });
    expect(screen.getByTestId('trk-0')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('trk-1')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('trk-2')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('trk-3')).toHaveAttribute('data-selected', 'false');
  });

  it('clicking the outer tracks div clears selection', () => {
    const { container } = render(<AlbumPanel />, { wrapper });
    fireEvent.click(screen.getByTestId('trk-0'));
    expect(screen.getByTestId('trk-0')).toHaveAttribute('data-selected', 'true');
    fireEvent.click(container.querySelector('[class*="tracks"]')!);
    expect(screen.getByTestId('trk-0')).toHaveAttribute('data-selected', 'false');
  });

  // ── artist navigation ─────────────────────────────────────────────────────

  it('artist name is clickable when artistItem is present', async () => {
    const artistItem: SonosItem = {
      name: 'The Beatles',
      type: 'ARTIST',
      resource: { type: 'ARTIST', id: { objectId: 'art-1', serviceId: 'svc-1', accountId: 'acc-1' } },
    } as SonosItem;
    mockUseAlbumBrowse.mockReturnValue({ data: makeAlbumData({ artistItem }), isLoading: false, error: null });
    const user = userEvent.setup();
    render(<AlbumPanel />, { wrapper });
    await user.click(screen.getByText('The Beatles'));
    expect(mockNavigate).toHaveBeenCalledWith('/artist/art-1', expect.anything());
  });

  it('renders each artist as a separate link for a multi-artist album header', () => {
    mockUseAlbumBrowse.mockReturnValue({
      data: makeAlbumData({ artist: 'Sonny Stitt, Kenny Garrett', artistItem: null }),
      isLoading: false,
      error: null,
    });
    render(<AlbumPanel />, { wrapper });
    expect(screen.getByRole('button', { name: 'Sonny Stitt' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kenny Garrett' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sonny Stitt, Kenny Garrett' })).toBeNull();
  });

  it('clicking a single artist on a multi-artist album header resolves that artist via search', async () => {
    mockUseAlbumBrowse.mockReturnValue({
      data: makeAlbumData({ artist: 'Sonny Stitt, Kenny Garrett', artistItem: null }),
      isLoading: false,
      error: null,
    });
    vi.mocked(window.sonos.fetch).mockResolvedValueOnce({
      data: {
        resourceOrder: ['ARTISTS'],
        ARTISTS: {
          resources: [
            {
              id: { objectId: 'kg-id', serviceId: 'svc-1', accountId: 'acc-1' },
              name: 'Kenny Garrett',
              images: [],
            },
          ],
        },
      },
    } as never);
    const user = userEvent.setup();
    render(<AlbumPanel />, { wrapper });
    await user.click(screen.getByRole('button', { name: 'Kenny Garrett' }));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(expect.stringMatching(/^\/artist\//), expect.anything());
    });
  });

  // ── playlist mode ─────────────────────────────────────────────────────────

  it('renders playlist tracks when item is a playlist', () => {
    mockUseLocation.mockReturnValue({ state: { item: playlistItem } });
    const tracks = [makeTrack('Track One', 0), makeTrack('Track Two', 1)];
    mockUsePlaylistBrowse.mockReturnValue({ data: tracks, isLoading: false, error: null });
    mockUseAlbumBrowse.mockReturnValue({ data: undefined, isLoading: false, error: null });
    render(<AlbumPanel />, { wrapper });
    expect(screen.getByText('Track One')).toBeInTheDocument();
    expect(screen.getByText('Track Two')).toBeInTheDocument();
  });

  it('shows loading state for playlist', () => {
    mockUseLocation.mockReturnValue({ state: { item: playlistItem } });
    mockUsePlaylistBrowse.mockReturnValue({ data: undefined, isLoading: true, error: null });
    mockUseAlbumBrowse.mockReturnValue({ data: undefined, isLoading: false, error: null });
    const { container } = render(<AlbumPanel />, { wrapper });
    expect(container.querySelectorAll('[class*="skeletonRow"]').length).toBeGreaterThan(0);
  });

  it('shows playlist title from location item when no data title', () => {
    mockUseLocation.mockReturnValue({ state: { item: playlistItem } });
    mockUsePlaylistBrowse.mockReturnValue({ data: undefined, isLoading: false, error: null });
    render(<AlbumPanel />, { wrapper });
    expect(screen.getByText('My Playlist')).toBeInTheDocument();
  });

  // ── about this album (Genius) ─────────────────────────────────────────────

  describe('About card', () => {
    const para = (text: string) => ({ tag: 'root', children: [{ tag: 'p', children: [text] }] });
    beforeEach(() => {
      vi.mocked(window.sonos.geniusAlbumAbout).mockReset().mockResolvedValue(null);
      vi.mocked(window.sonos.geniusArtist).mockReset().mockResolvedValue(null);
    });

    it("shows the album's Genius description, release date and source link", async () => {
      vi.mocked(window.sonos.geniusAlbumAbout).mockResolvedValue({
        description: para('The final Beatles album recorded.'),
        releaseDate: '1969-09-26',
        url: 'https://genius.com/albums/The-beatles/Abbey-road',
      });
      render(<AlbumPanel />, { wrapper });
      expect(await screen.findByText('The final Beatles album recorded.')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'About this album' })).toBeInTheDocument();
      expect(screen.getByText('Released 26 September 1969')).toBeInTheDocument();
      expect(window.sonos.geniusAlbumAbout).toHaveBeenCalledWith('Abbey Road', 'The Beatles');
      expect(window.sonos.geniusArtist).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('link', { name: 'Read more on Genius' }));
      expect(window.sonos.openExternal).toHaveBeenCalledWith('https://genius.com/albums/The-beatles/Abbey-road');
    });

    it("falls back to the artist's Genius bio when the album has no description", async () => {
      vi.mocked(window.sonos.geniusAlbumAbout).mockResolvedValue({
        description: para('?'),
        url: 'https://genius.com/albums/x',
      });
      vi.mocked(window.sonos.geniusArtist).mockResolvedValue({
        description: para('A band from Liverpool.'),
        alternateNames: [],
        imageUrl: null,
        headerImageUrl: null,
        instagram: null,
        twitter: null,
      });
      render(<AlbumPanel />, { wrapper });
      expect(await screen.findByText('A band from Liverpool.')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'About The Beatles' })).toBeInTheDocument();
      expect(screen.queryByText(/^Released/)).toBeNull();
    });

    it('shows a skeleton, not "Loading…", while Genius answers', () => {
      vi.mocked(window.sonos.geniusAlbumAbout).mockReturnValue(new Promise(() => {}));
      const { container } = render(<AlbumPanel />, { wrapper });
      expect(screen.getByRole('heading', { name: 'About this album' })).toBeInTheDocument();
      expect(container.querySelectorAll('[class*="skelLine"]').length).toBeGreaterThan(0);
      expect(screen.queryByText(/Loading/)).toBeNull();
    });

    it('renders no card when Genius has nothing for the album or the artist', async () => {
      render(<AlbumPanel />, { wrapper });
      await waitFor(() => expect(window.sonos.geniusArtist).toHaveBeenCalledWith('The Beatles'));
      await waitFor(() => expect(screen.queryByRole('heading', { name: /^About/ })).toBeNull());
      expect(screen.getByText('Come Together')).toBeInTheDocument();
    });

    it('asks Genius nothing for a playlist', () => {
      mockUseLocation.mockReturnValue({ state: { item: playlistItem } });
      mockUsePlaylistBrowse.mockReturnValue({ data: [], isLoading: false, error: null });
      render(<AlbumPanel />, { wrapper });
      expect(window.sonos.geniusAlbumAbout).not.toHaveBeenCalled();
      expect(screen.queryByRole('heading', { name: /^About/ })).toBeNull();
    });
  });
});
