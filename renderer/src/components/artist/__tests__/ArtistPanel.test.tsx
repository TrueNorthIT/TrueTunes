import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArtistPanel } from '../ArtistPanel';
import type { SonosItem } from '../../../types/sonos';

const mockUseLocation = vi.fn();
vi.mock('react-router-dom', () => ({ useLocation: () => mockUseLocation() }));
const mockUseImage = vi.fn();
vi.mock('../../../hooks/useImage', () => ({ useImage: (...args: unknown[]) => mockUseImage(...args) }));
vi.mock('../../../hooks/useAlbumBrowse', () => ({ useAlbumBrowse: () => ({ data: { totalTracks: 12 } }) }));
vi.mock('../../../hooks/useDominantColor', () => ({ useDominantColor: () => null }));
vi.mock('../../../hooks/useOpenItem', () => ({ useOpenItem: () => vi.fn() }));

const mockUseArtistBrowse = vi.fn();
vi.mock('../../../hooks/useArtistBrowse', () => ({
  useArtistBrowse: (...args: unknown[]) => mockUseArtistBrowse(...args),
}));

const mockYears = vi.fn();
vi.mock('../../../hooks/useReleaseYears', () => ({
  useReleaseYears: () => mockYears(),
}));

const mockTracklists = vi.fn();
vi.mock('../../../hooks/useReleaseTracklists', () => ({
  useReleaseTracklists: (...args: unknown[]) => mockTracklists(...args),
}));

const mockCounts = vi.fn();
vi.mock('../../../hooks/useReleaseTrackCounts', () => ({
  useReleaseTrackCounts: () => mockCounts(),
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
  ArtistAlbumCard: ({ album, trackHits }: { album: { title: string }; trackHits?: string[] }) => (
    <div>
      {album.title}
      {trackHits?.length ? <span>♪ {trackHits[0]}</span> : null}
    </div>
  ),
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

const defaultProps = { onAddToQueue: vi.fn(), currentTrackName: '', isPlaybackActive: false };

beforeEach(() => {
  vi.clearAllMocks();
  mockUseImage.mockReturnValue(null);
  mockUseLocation.mockReturnValue({ state: { item: artistItem } });
  mockUseArtistBrowse.mockReturnValue({ data: makeData(), isLoading: false });
  mockCounts.mockReturnValue({ counts: new Map(), isLoading: false });
  mockYears.mockReturnValue({ years: new Map(), isLoading: false });
  mockTracklists.mockReturnValue({ tracksByRelease: new Map(), isLoading: false });
});

describe('ArtistPanel', () => {
  it('returns nothing when no item in state', () => {
    mockUseLocation.mockReturnValue({ state: null });
    const { container } = render(<ArtistPanel {...defaultProps} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows artist name from data', () => {
    render(<ArtistPanel {...defaultProps} />);
    expect(screen.getByText('The Beatles')).toBeInTheDocument();
  });

  it('shows loading skeletons while loading', () => {
    mockUseArtistBrowse.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = render(<ArtistPanel {...defaultProps} />);
    expect(container.querySelectorAll('[class*="skeletonRow"]').length).toBeGreaterThan(0);
  });

  it('renders top songs when available', () => {
    const topSongs = [
      { name: 'Come Together', id: { objectId: 'trk-1' } },
      { name: 'Let It Be', id: { objectId: 'trk-2' } },
    ];
    mockUseArtistBrowse.mockReturnValue({ data: makeData({ topSongs }), isLoading: false });
    render(<ArtistPanel {...defaultProps} />);
    expect(screen.getByText('Come Together')).toBeInTheDocument();
    expect(screen.getByText('Let It Be')).toBeInTheDocument();
  });

  it('shows every top song in a Top Songs carousel, with no Show all toggle', () => {
    const topSongs = Array.from({ length: 12 }, (_, i) => ({
      name: `Song ${i + 1}`,
      id: { objectId: `trk-${i}` },
    }));
    mockUseArtistBrowse.mockReturnValue({ data: makeData({ topSongs }), isLoading: false });
    render(<ArtistPanel {...defaultProps} />);
    expect(screen.getByRole('heading', { name: 'Top Songs' })).toBeInTheDocument();
    expect(screen.getByText('Song 12')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Show all|Show less/ })).not.toBeInTheDocument();
  });

  describe('hero', () => {
    it('renders the full-bleed photo at the large size when the artist has an image', () => {
      mockUseImage.mockImplementation((u: string | null) => u);
      mockUseArtistBrowse.mockReturnValue({
        data: makeData({ imageUrl: 'https://lh3.example/a=w544-h544-l90-rj' }),
        isLoading: false,
      });
      const { container } = render(<ArtistPanel {...defaultProps} />);
      const img = container.querySelector('[class*="heroImg"]');
      expect(img).toHaveAttribute('src', 'https://lh3.example/a=w2000-h2000-l90-rj');
      expect(screen.getByRole('heading', { name: 'The Beatles' })).toBeInTheDocument();
    });

    it('falls back to the colour-wash header when there is no artist image', () => {
      const { container } = render(<ArtistPanel {...defaultProps} />);
      expect(container.querySelector('[class*="hero"]')).toBeNull();
      expect(container.querySelector('[class*="washHeader"]')).not.toBeNull();
      expect(screen.getByRole('heading', { name: 'The Beatles' })).toBeInTheDocument();
    });
  });

  describe('About and Radio', () => {
    const long = 'Sentence about the band. '.repeat(20);
    const withGenius = (blurb: string) => ({
      genius: {
        description: { tag: 'root', children: [{ tag: 'p', children: [blurb] }] },
        alternateNames: [],
        instagram: 'beatles',
        twitter: null,
      },
    });

    it('puts About at the very bottom with a More toggle and the social icons inside', async () => {
      mockUseArtistBrowse.mockReturnValue({ data: makeData(withGenius(long)), isLoading: false });
      const user = userEvent.setup();
      const { container } = render(<ArtistPanel {...defaultProps} />);
      const about = screen.getByRole('region', { name: 'About The Beatles' });
      expect(container.querySelector('[class*="panel"]')?.lastElementChild).toBe(about);
      expect(about).toContainElement(screen.getByRole('button', { name: 'Instagram @beatles' }));
      const more = screen.getByRole('button', { name: 'More' });
      expect(more).toHaveAttribute('aria-expanded', 'false');
      await user.click(more);
      expect(screen.getByRole('button', { name: 'Less' })).toHaveAttribute('aria-expanded', 'true');
    });

    it('shows no More toggle for a short bio', () => {
      mockUseArtistBrowse.mockReturnValue({ data: makeData(withGenius('Short.')), isLoading: false });
      render(<ArtistPanel {...defaultProps} />);
      expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument();
    });

    it('renders a Radio shelf for the artist playlists, and hides it when there are none', () => {
      const playlists = [{ title: 'Artist Shuffle', id: { objectId: 'p1' } }, { title: 'Artist Radio', id: { objectId: 'p2' } }];
      mockUseArtistBrowse.mockReturnValue({ data: makeData({ playlists }), isLoading: false });
      const { unmount } = render(<ArtistPanel {...defaultProps} />);
      expect(screen.getByRole('heading', { name: 'Radio' })).toBeInTheDocument();
      expect(screen.getByText('Artist Shuffle')).toBeInTheDocument();
      unmount();
      mockUseArtistBrowse.mockReturnValue({ data: makeData(), isLoading: false });
      render(<ArtistPanel {...defaultProps} />);
      expect(screen.queryByRole('heading', { name: 'Radio' })).not.toBeInTheDocument();
    });
  });

  it('renders albums section when more than one album', () => {
    const albums = [
      { title: 'Album One', id: { objectId: 'alb-1' } },
      { title: 'Album Two', id: { objectId: 'alb-2' } },
    ];
    mockUseArtistBrowse.mockReturnValue({ data: makeData({ albums }), isLoading: false });
    render(<ArtistPanel {...defaultProps} />);
    expect(screen.getByText('Albums')).toBeInTheDocument();
    expect(screen.getAllByText('Album Two').length).toBeGreaterThan(0);
  });

  it('does not render albums section when only one album', () => {
    const albums = [{ title: 'Abbey Road', id: { objectId: 'alb-1' } }];
    mockUseArtistBrowse.mockReturnValue({ data: makeData({ albums }), isLoading: false });
    render(<ArtistPanel {...defaultProps} />);
    expect(screen.queryByText('Albums')).not.toBeInTheDocument();
  });

  it('splits releases into Albums, Singles & EPs and Other versions shelves', () => {
    const albums = [
      { title: 'Latest', id: { objectId: 'l' } },
      { title: 'Big Record', id: { objectId: 'big' } },
      { title: 'Tiny Single', id: { objectId: 'tiny' } },
      { title: 'Tiny Single (Live)', id: { objectId: 'tinylive' } },
      { title: 'Lonely (Remix)', id: { objectId: 'lonely' } },
    ];
    mockCounts.mockReturnValue({ counts: new Map([['big', 10], ['tiny', 1], ['l', 8]]), isLoading: false });
    mockUseArtistBrowse.mockReturnValue({ data: makeData({ albums }), isLoading: false });
    render(<ArtistPanel {...defaultProps} />);
    const heads = screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent);
    expect(heads).toEqual(['Albums', 'Singles & EPs', 'Other versions']);
  });

  it('hides empty shelves', () => {
    const albums = [
      { title: 'A', id: { objectId: 'a' } },
      { title: 'B', id: { objectId: 'b' } },
    ];
    mockUseArtistBrowse.mockReturnValue({ data: makeData({ albums }), isLoading: false });
    render(<ArtistPanel {...defaultProps} />);
    expect(screen.queryByText('Singles & EPs')).not.toBeInTheDocument();
    expect(screen.queryByText('Other versions')).not.toBeInTheDocument();
  });

  it('shows a skeleton instead of shelves while counts load', () => {
    const albums = [
      { title: 'A', id: { objectId: 'a' } },
      { title: 'B', id: { objectId: 'b' } },
    ];
    mockCounts.mockReturnValue({ counts: new Map(), isLoading: true });
    mockUseArtistBrowse.mockReturnValue({ data: makeData({ albums }), isLoading: false });
    const { container } = render(<ArtistPanel {...defaultProps} />);
    expect(screen.queryByText('Albums')).not.toBeInTheDocument();
    expect(container.querySelectorAll('[class*="shelfSkeleton"]')).toHaveLength(1);
  });

  it('expands a stack in place on click and collapses again', async () => {
    const albums = [
      { title: 'Latest', id: { objectId: 'l' } },
      { title: 'Foo', id: { objectId: 'foo' } },
      { title: 'Foo (Deluxe)', id: { objectId: 'food' } },
    ];
    mockCounts.mockReturnValue({ counts: new Map([['foo', 10], ['food', 14], ['l', 9]]), isLoading: false });
    mockUseArtistBrowse.mockReturnValue({ data: makeData({ albums }), isLoading: false });
    const user = userEvent.setup();
    render(<ArtistPanel {...defaultProps} />);
    expect(screen.getByText('2 versions')).toBeInTheDocument();
    expect(screen.queryByText('Foo (Deluxe)')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Foo, 2 versions/ }));
    expect(screen.getByText('Foo (Deluxe)')).toBeInTheDocument();
    expect(screen.queryByText('2 versions')).not.toBeInTheDocument();
    expect(screen.getByText('Foo · 2 versions')).toBeInTheDocument();
    // focus moves to the group's ✕ on expand, and back to the stack on collapse
    expect(screen.getByRole('button', { name: 'Collapse Foo versions' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Collapse Foo versions' }));
    expect(screen.getByText('2 versions')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Foo, 2 versions/ })).toHaveFocus();
  });

  it('shows the primary year on a stack', () => {
    const albums = [
      { title: 'Latest', id: { objectId: 'l' } },
      { title: 'Foo', id: { objectId: 'foo' } },
      { title: 'Foo (Deluxe)', id: { objectId: 'food' } },
    ];
    mockYears.mockReturnValue({ years: new Map([['foo', 2019]]), isLoading: false });
    mockUseArtistBrowse.mockReturnValue({ data: makeData({ albums }), isLoading: false });
    render(<ArtistPanel {...defaultProps} />);
    expect(screen.getByText('2019')).toBeInTheDocument();
  });

  describe('shelf search', () => {
    const albums = [
      { title: 'Latest', id: { objectId: 'l' } },
      { title: 'Mountainhead', id: { objectId: 'mh' } },
      { title: 'Raw Data Feel', id: { objectId: 'rdf' } },
      { title: 'Pizza Boy', id: { objectId: 'pb' } },
    ];
    beforeEach(() => {
      mockCounts.mockReturnValue({
        counts: new Map([['l', 9], ['mh', 11], ['rdf', 14], ['pb', 1]]),
        isLoading: false,
      });
      mockTracklists.mockReturnValue({
        tracksByRelease: new Map([['rdf', ['Teletype', 'Pizza Boy']]]),
        isLoading: false,
      });
      mockUseArtistBrowse.mockReturnValue({ data: makeData({ albums }), isLoading: false });
    });

    it('renders the search box once and enables track loading on first focus', async () => {
      const user = userEvent.setup();
      render(<ArtistPanel {...defaultProps} />);
      expect(screen.getAllByRole('textbox')).toHaveLength(1);
      expect(mockTracklists).toHaveBeenLastCalledWith(expect.anything(), false);
      await user.click(screen.getByRole('textbox'));
      expect(mockTracklists).toHaveBeenLastCalledWith(expect.anything(), true);
    });

    it('filters the shelves while typing, shows a track hit line, and restores on clear', async () => {
      const user = userEvent.setup();
      render(<ArtistPanel {...defaultProps} />);
      await user.type(screen.getByRole('textbox'), 'pizza');
      expect(screen.queryByText('Mountainhead')).not.toBeInTheDocument();
      expect(screen.getByText('Raw Data Feel')).toBeInTheDocument();
      expect(screen.getByText('♪ Pizza Boy')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Singles & EPs' })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Clear search' }));
      expect(screen.getByText('Mountainhead')).toBeInTheDocument();
      expect(screen.queryByText('♪ Pizza Boy')).not.toBeInTheDocument();
    });

    it('keeps the box when the first shelf is emptied, and shows a no-match message', async () => {
      const user = userEvent.setup();
      render(<ArtistPanel {...defaultProps} />);
      await user.type(screen.getByRole('textbox'), 'zzzz');
      expect(screen.getAllByRole('textbox')).toHaveLength(1);
      expect(screen.getByText('No releases match “zzzz”')).toBeInTheDocument();
    });
  });
});
