import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlbumPanel } from '../AlbumPanel';
import type { SonosItem } from '../../../types/sonos';

const mockUseLocation = vi.fn();
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useLocation: () => mockUseLocation(),
  useNavigate: () => mockNavigate,
}));
vi.mock('../../../hooks/useImage', () => ({ useImage: () => null }));
vi.mock('../../../hooks/useDominantColor', () => ({ useDominantColor: () => null }));
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
  AlbumTrackRow: ({ track }: { track: { title: string } }) => <div>{track.title}</div>,
}));

function makeTrack(title: string, idx: number) {
  return {
    title,
    ordinal: idx + 1,
    durationSeconds: 210,
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
  mockUseLocation.mockReturnValue({ state: { item: albumItem } });
  mockUseAlbumBrowse.mockReturnValue({ data: makeAlbumData(), isLoading: false, error: null });
  mockUsePlaylistBrowse.mockReturnValue({ data: undefined, isLoading: false, error: null });
});

describe('AlbumPanel', () => {
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

  it('add to queue button calls onAddToQueue for each track', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<AlbumPanel onAddToQueue={onAdd} />, { wrapper });
    await user.click(screen.getByText('+ Add to Queue'));
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(2));
  });

  it('shows track count and duration', () => {
    render(<AlbumPanel onAddToQueue={vi.fn()} />, { wrapper });
    expect(screen.getByText(/2 songs/)).toBeInTheDocument();
  });

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
    expect(mockNavigate).toHaveBeenCalled();
  });
});
