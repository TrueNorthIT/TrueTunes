import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlbumPanel } from '../AlbumPanel';
import type { SonosItem } from '../../../types/sonos';

const mockUseLocation = vi.fn();
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useLocation: () => mockUseLocation(),
  useNavigate: () => mockNavigate,
}));

const mockUseImage = vi.fn();
vi.mock('../../../hooks/useImage', () => ({ useImage: (...a: unknown[]) => mockUseImage(...a) }));

const mockUseDominantColor = vi.fn();
vi.mock('../../../hooks/useDominantColor', () => ({ useDominantColor: (...a: unknown[]) => mockUseDominantColor(...a) }));

vi.mock('../../../hooks/useArtistBrowse', () => ({ artistQueryOptions: vi.fn(() => ({ queryKey: [], queryFn: async () => null })) }));

const mockUseAlbumBrowse = vi.fn();
vi.mock('../../../hooks/useAlbumBrowse', () => ({
  useAlbumBrowse: (...args: unknown[]) => mockUseAlbumBrowse(...args),
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
    <div
      data-testid={track.id.objectId}
      data-selected={isSelected}
      onClick={onClick}
    >
      {track.title}
      <button onClick={(e) => { e.stopPropagation(); onAdd(); }}>Add</button>
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
  return createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }, children);
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
    const { container } = render(<AlbumPanel onAddToQueue={vi.fn()} />, { wrapper });
    expect(container.firstChild).toBeNull();
  });

  it('shows album title', () => {
    render(<AlbumPanel onAddToQueue={vi.fn()} />, { wrapper });
    expect(screen.getByText('Abbey Road')).toBeInTheDocument();
  });

  it('shows artist name', () => {
    render(<AlbumPanel onAddToQueue={vi.fn()} />, { wrapper });
    expect(screen.getByText('The Beatles')).toBeInTheDocument();
  });

  it('renders track list', () => {
    render(<AlbumPanel onAddToQueue={vi.fn()} />, { wrapper });
    expect(screen.getByText('Come Together')).toBeInTheDocument();
    expect(screen.getByText('Something')).toBeInTheDocument();
  });

  it('shows loading skeletons while loading', () => {
    mockUseAlbumBrowse.mockReturnValue({ data: undefined, isLoading: true, error: null });
    const { container } = render(<AlbumPanel onAddToQueue={vi.fn()} />, { wrapper });
    expect(container.querySelectorAll('[class*="skeletonRow"]').length).toBeGreaterThan(0);
  });

  it('shows error message when fetch fails', () => {
    mockUseAlbumBrowse.mockReturnValue({ data: undefined, isLoading: false, error: new Error('fail') });
    render(<AlbumPanel onAddToQueue={vi.fn()} />, { wrapper });
    expect(screen.getByText('Failed to load tracks.')).toBeInTheDocument();
  });

  it('shows no tracks message when empty', () => {
    mockUseAlbumBrowse.mockReturnValue({ data: makeAlbumData({ tracks: [], totalTracks: 0 }), isLoading: false, error: null });
    render(<AlbumPanel onAddToQueue={vi.fn()} />, { wrapper });
    expect(screen.getByText('No tracks found.')).toBeInTheDocument();
  });

  it('shows track count and duration', () => {
    render(<AlbumPanel onAddToQueue={vi.fn()} />, { wrapper });
    expect(screen.getByText(/2 songs/)).toBeInTheDocument();
    expect(screen.getByText(/7 min/)).toBeInTheDocument();
  });

  it('shows only song count when total duration is 0', () => {
    const tracks = [makeTrack('Song A', 0, 0), makeTrack('Song B', 1, 0)];
    mockUseAlbumBrowse.mockReturnValue({ data: makeAlbumData({ tracks, totalTracks: 2 }), isLoading: false, error: null });
    render(<AlbumPanel onAddToQueue={vi.fn()} />, { wrapper });
    const metaLine = screen.getByText(/2 songs/);
    expect(metaLine.textContent).not.toContain('min');
  });

  // ── display ───────────────────────────────────────────────────────────────

  it('shows art image when useImage returns a URL', () => {
    mockUseImage.mockReturnValue('http://img.com/art.jpg');
    const { container } = render(<AlbumPanel onAddToQueue={vi.fn()} />, { wrapper });
    expect(container.querySelector('img[src="http://img.com/art.jpg"]')).toBeTruthy();
  });

  it('applies gradient background when dominant color is set', () => {
    mockUseDominantColor.mockReturnValue('200, 100, 50');
    const { container } = render(<AlbumPanel onAddToQueue={vi.fn()} />, { wrapper });
    const header = container.querySelector('[class*="header"]') as HTMLElement;
    expect(header?.style.background).toContain('200, 100, 50');
  });

  it('queueOpen prop adds padding-right to tracks container', () => {
    const { container } = render(<AlbumPanel onAddToQueue={vi.fn()} queueOpen />, { wrapper });
    const tracks = container.querySelector('[class*="tracks"]') as HTMLElement;
    expect(tracks?.style.paddingRight).toBeTruthy();
  });

  // ── add to queue ──────────────────────────────────────────────────────────

  it('add to queue button calls onAddToQueue once with the album item (handler fans out per-track)', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<AlbumPanel onAddToQueue={onAdd} />, { wrapper });
    await user.click(screen.getByText('+ Add to Queue'));
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    expect(onAdd).toHaveBeenCalledWith(albumItem);
  });

  it('clicking Add on a track row calls onAddToQueue with that track raw', () => {
    const onAdd = vi.fn();
    render(<AlbumPanel onAddToQueue={onAdd} />, { wrapper });
    fireEvent.click(screen.getAllByText('Add')[0]);
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ name: 'Come Together' }));
  });

  // ── track selection ───────────────────────────────────────────────────────

  it('single-clicking a track selects it', () => {
    render(<AlbumPanel onAddToQueue={vi.fn()} />, { wrapper });
    fireEvent.click(screen.getByTestId('trk-0'));
    expect(screen.getByTestId('trk-0')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('trk-1')).toHaveAttribute('data-selected', 'false');
  });

  it('clicking a selected track deselects it', () => {
    render(<AlbumPanel onAddToQueue={vi.fn()} />, { wrapper });
    fireEvent.click(screen.getByTestId('trk-0'));
    fireEvent.click(screen.getByTestId('trk-0'));
    expect(screen.getByTestId('trk-0')).toHaveAttribute('data-selected', 'false');
  });

  it('ctrl+click adds another track to selection', () => {
    render(<AlbumPanel onAddToQueue={vi.fn()} />, { wrapper });
    fireEvent.click(screen.getByTestId('trk-0'));
    fireEvent.click(screen.getByTestId('trk-1'), { ctrlKey: true });
    expect(screen.getByTestId('trk-0')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('trk-1')).toHaveAttribute('data-selected', 'true');
  });

  it('ctrl+click on a selected track removes it from selection', () => {
    render(<AlbumPanel onAddToQueue={vi.fn()} />, { wrapper });
    fireEvent.click(screen.getByTestId('trk-0'));
    fireEvent.click(screen.getByTestId('trk-1'), { ctrlKey: true });
    fireEvent.click(screen.getByTestId('trk-0'), { ctrlKey: true });
    expect(screen.getByTestId('trk-0')).toHaveAttribute('data-selected', 'false');
    expect(screen.getByTestId('trk-1')).toHaveAttribute('data-selected', 'true');
  });

  it('shift+click range-selects from last to target', () => {
    const tracks = Array.from({ length: 4 }, (_, i) => makeTrack(`Song ${i}`, i));
    mockUseAlbumBrowse.mockReturnValue({ data: makeAlbumData({ tracks, totalTracks: 4 }), isLoading: false, error: null });
    render(<AlbumPanel onAddToQueue={vi.fn()} />, { wrapper });
    fireEvent.click(screen.getByTestId('trk-0'));
    fireEvent.click(screen.getByTestId('trk-2'), { shiftKey: true });
    expect(screen.getByTestId('trk-0')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('trk-1')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('trk-2')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('trk-3')).toHaveAttribute('data-selected', 'false');
  });

  it('clicking the outer tracks div clears selection', () => {
    const { container } = render(<AlbumPanel onAddToQueue={vi.fn()} />, { wrapper });
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
    render(<AlbumPanel onAddToQueue={vi.fn()} />, { wrapper });
    await user.click(screen.getByText('The Beatles'));
    expect(mockNavigate).toHaveBeenCalledWith('/artist/art-1', expect.anything());
  });

  // ── playlist mode ─────────────────────────────────────────────────────────

  it('renders playlist tracks when item is a playlist', () => {
    mockUseLocation.mockReturnValue({ state: { item: playlistItem } });
    const tracks = [makeTrack('Track One', 0), makeTrack('Track Two', 1)];
    mockUsePlaylistBrowse.mockReturnValue({ data: tracks, isLoading: false, error: null });
    mockUseAlbumBrowse.mockReturnValue({ data: undefined, isLoading: false, error: null });
    render(<AlbumPanel onAddToQueue={vi.fn()} />, { wrapper });
    expect(screen.getByText('Track One')).toBeInTheDocument();
    expect(screen.getByText('Track Two')).toBeInTheDocument();
  });

  it('shows loading state for playlist', () => {
    mockUseLocation.mockReturnValue({ state: { item: playlistItem } });
    mockUsePlaylistBrowse.mockReturnValue({ data: undefined, isLoading: true, error: null });
    mockUseAlbumBrowse.mockReturnValue({ data: undefined, isLoading: false, error: null });
    const { container } = render(<AlbumPanel onAddToQueue={vi.fn()} />, { wrapper });
    expect(container.querySelectorAll('[class*="skeletonRow"]').length).toBeGreaterThan(0);
  });

  it('shows playlist title from location item when no data title', () => {
    mockUseLocation.mockReturnValue({ state: { item: playlistItem } });
    mockUsePlaylistBrowse.mockReturnValue({ data: undefined, isLoading: false, error: null });
    render(<AlbumPanel onAddToQueue={vi.fn()} />, { wrapper });
    expect(screen.getByText('My Playlist')).toBeInTheDocument();
  });
});
