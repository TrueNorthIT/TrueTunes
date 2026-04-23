import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArtistPanel } from '../ArtistPanel';
import type { SonosItem } from '../../../types/sonos';

const mockUseLocation = vi.fn();
vi.mock('react-router-dom', () => ({ useLocation: () => mockUseLocation() }));
vi.mock('../../../hooks/useImage', () => ({ useImage: () => null }));
vi.mock('../../../hooks/useDominantColor', () => ({ useDominantColor: () => null }));
vi.mock('../../../hooks/useOpenItem', () => ({ useOpenItem: () => vi.fn() }));

const mockUseArtistBrowse = vi.fn();
vi.mock('../../../hooks/useArtistBrowse', () => ({
  useArtistBrowse: (...args: unknown[]) => mockUseArtistBrowse(...args),
}));

vi.mock('../TopSongRow', () => ({
  TopSongRow: ({ track }: { track: { name: string } }) => <div>{track.name}</div>,
}));
vi.mock('../LatestReleaseCard', () => ({
  LatestReleaseCard: ({ album }: { album: { title: string } }) => <div>{album.title}</div>,
}));
vi.mock('../RadioCard', () => ({
  RadioCard: ({ item }: { item: { title: string } }) => <div>{item.title}</div>,
}));
vi.mock('../ArtistAlbumCard', () => ({
  ArtistAlbumCard: ({ album }: { album: { title: string } }) => <div>{album.title}</div>,
}));

const artistItem: SonosItem = {
  name: 'The Beatles',
  type: 'ARTIST',
  resource: {
    type: 'ARTIST',
    id: { objectId: 'artist-1', serviceId: 'svc-1', accountId: 'acc-1' },
  },
} as SonosItem;

function makeData(overrides = {}) {
  return {
    name: 'The Beatles',
    imageUrl: null,
    topSongs: [],
    albums: [],
    playlists: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseLocation.mockReturnValue({ state: { item: artistItem } });
  mockUseArtistBrowse.mockReturnValue({ data: makeData(), isLoading: false });
});

describe('ArtistPanel', () => {
  it('returns nothing when no item in state', () => {
    mockUseLocation.mockReturnValue({ state: null });
    const { container } = render(<ArtistPanel onAddToQueue={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows artist name from data', () => {
    render(<ArtistPanel onAddToQueue={vi.fn()} />);
    expect(screen.getByText('The Beatles')).toBeInTheDocument();
  });

  it('shows loading skeletons while loading', () => {
    mockUseArtistBrowse.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = render(<ArtistPanel onAddToQueue={vi.fn()} />);
    expect(container.querySelectorAll('[class*="skeletonRow"]').length).toBeGreaterThan(0);
  });

  it('renders top songs when available', () => {
    const topSongs = [
      { name: 'Come Together', id: { objectId: 'trk-1' } },
      { name: 'Let It Be', id: { objectId: 'trk-2' } },
    ];
    mockUseArtistBrowse.mockReturnValue({ data: makeData({ topSongs }), isLoading: false });
    render(<ArtistPanel onAddToQueue={vi.fn()} />);
    expect(screen.getByText('Come Together')).toBeInTheDocument();
    expect(screen.getByText('Let It Be')).toBeInTheDocument();
  });

  it('toggles showing all songs when Top Songs button is clicked', async () => {
    const topSongs = Array.from({ length: 12 }, (_, i) => ({
      name: `Song ${i + 1}`,
      id: { objectId: `trk-${i}` },
    }));
    mockUseArtistBrowse.mockReturnValue({ data: makeData({ topSongs }), isLoading: false });
    const user = userEvent.setup();
    render(<ArtistPanel onAddToQueue={vi.fn()} />);
    // Initially shows first 10
    expect(screen.queryByText('Song 11')).not.toBeInTheDocument();
    await user.click(screen.getByText(/Top Songs/));
    // After click shows all 12
    expect(screen.getByText('Song 11')).toBeInTheDocument();
  });

  it('renders albums section when more than one album', () => {
    const albums = [
      { title: 'Album One', id: { objectId: 'alb-1' } },
      { title: 'Album Two', id: { objectId: 'alb-2' } },
    ];
    mockUseArtistBrowse.mockReturnValue({ data: makeData({ albums }), isLoading: false });
    render(<ArtistPanel onAddToQueue={vi.fn()} />);
    expect(screen.getByText('Albums')).toBeInTheDocument();
    expect(screen.getAllByText('Album Two').length).toBeGreaterThan(0);
  });

  it('does not render albums section when only one album', () => {
    const albums = [{ title: 'Abbey Road', id: { objectId: 'alb-1' } }];
    mockUseArtistBrowse.mockReturnValue({ data: makeData({ albums }), isLoading: false });
    render(<ArtistPanel onAddToQueue={vi.fn()} />);
    expect(screen.queryByText('Albums')).not.toBeInTheDocument();
  });
});
