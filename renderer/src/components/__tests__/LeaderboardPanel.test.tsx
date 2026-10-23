import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LeaderboardPanel } from '../LeaderboardPanel';

interface AlbumResource {
  name: string;
  objectId: string;
  serviceId: string;
  accountId: string;
  artistName?: string;
}

function mockSearchResolves(opts: {
  artist?: { name: string; objectId: string; serviceId: string; accountId: string };
  album?: AlbumResource;
  albums?: AlbumResource[];
}) {
  const albumList = opts.albums ?? (opts.album ? [opts.album] : []);
  vi.mocked(window.sonos.fetch).mockResolvedValueOnce({
    data: {
      resourceOrder: ['ARTISTS', 'ALBUMS'],
      ARTISTS: {
        resources: opts.artist
          ? [
              {
                id: {
                  objectId: opts.artist.objectId,
                  serviceId: opts.artist.serviceId,
                  accountId: opts.artist.accountId,
                },
                name: opts.artist.name,
                images: [],
              },
            ]
          : [],
      },
      ALBUMS: {
        resources: albumList.map((a) => ({
          id: { objectId: a.objectId, serviceId: a.serviceId, accountId: a.accountId },
          name: a.name,
          images: [],
          artists: a.artistName
            ? [
                {
                  name: a.artistName,
                  id: { objectId: `${a.objectId}-artist`, serviceId: a.serviceId, accountId: a.accountId },
                },
              ]
            : [],
        })),
      },
    },
  } as never);
}

const mockNavigate = vi.fn();
const mockUseGameRankings = vi.fn();
vi.mock('react-router-dom', async (importActual) => {
  const actual = await importActual<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

// The page-level stats are stubbed; each person's own stats go through the real query options and window.sonos.fetchStats.
vi.mock('../../hooks/useStats', async (importActual) => {
  const actual = await importActual<typeof import('../../hooks/useStats')>();
  return { ...actual, useStats: vi.fn() };
});
import { useStats } from '../../hooks/useStats';
const mockUseStats = vi.mocked(useStats);

vi.mock('../../hooks/useImage', () => ({
  useImage: (url: string | null | undefined) => url ?? null,
}));

vi.mock('../../hooks/useArtistBrowse', () => ({
  useArtistImage: () => ({ data: null }),
  artistQueryOptions: vi.fn(() => ({ queryKey: [], queryFn: async () => null })),
}));

vi.mock('../../hooks/useDailyGame', () => ({
  useGameRankings: (userName: string | null | undefined, enabled: boolean) => mockUseGameRankings(userName, enabled),
}));

const mockData: StatsResult = {
  topUsers: [
    { userId: 'alice', count: 10 },
    { userId: 'bob', count: 7 },
  ],
  topTracks: [
    {
      trackName: 'Bohemian Rhapsody',
      artist: 'Queen',
      count: 5,
      artistId: 'art1',
      serviceId: 'svc1',
      accountId: 'acc1',
      uri: 'uri-bo',
    },
    { trackName: 'Hotel California', artist: 'Eagles', count: 3 },
  ],
  topArtists: [
    { artist: 'Queen', artistId: 'art1', serviceId: 'svc1', accountId: 'acc1', count: 5 },
    { artist: 'Eagles', count: 3 },
  ],
  topAlbums: [
    { album: 'A Night at the Opera', artist: 'Queen', albumId: 'alb1', serviceId: 'svc1', accountId: 'acc1', count: 4 },
  ],
  totalEvents: 25,
  periodStart: 0,
};

const empty: StatsResult = {
  topUsers: [],
  topTracks: [],
  topArtists: [],
  topAlbums: [],
  totalEvents: 0,
  periodStart: 0,
};

function mockLoaded(data: StatsResult = mockData) {
  mockUseStats.mockReturnValue({ data, isLoading: false, error: null } as unknown as ReturnType<typeof useStats>);
}

function renderPanel(props: Parameters<typeof LeaderboardPanel>[0] = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return render(<LeaderboardPanel {...props} />, { wrapper });
}

const ranking = (over: Record<string, unknown> = {}) => ({
  userName: 'queuedle-player',
  gamesPlayed: 3,
  averageTotal: 4.666,
  averageMain: 3,
  averageBonus: 1.666,
  averagePercent: 77.7,
  totalScore: 14,
  possibleScore: 18,
  bestTotal: 6,
  tierKey: 'algorithm-whisperer',
  tierName: 'Algorithm Whisperer',
  isProvisional: false,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockLoaded();
  vi.mocked(window.sonos.fetchStats).mockImplementation(() => new Promise(() => {}));
  mockUseGameRankings.mockReturnValue({ data: [], isLoading: false, error: null });
});

describe('LeaderboardPanel', () => {
  describe('states', () => {
    it('shows skeleton cards, not a loading message, while fetching', () => {
      mockUseStats.mockReturnValue({ data: undefined, isLoading: true, error: null } as unknown as ReturnType<
        typeof useStats
      >);
      const { container } = renderPanel();
      expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(6);
      expect(screen.queryByText(/Loading/)).toBeNull();
    });

    it('shows an error message on fetch failure', () => {
      mockUseStats.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('x'),
      } as unknown as ReturnType<typeof useStats>);
      renderPanel();
      expect(screen.getByText('Failed to load stats')).toBeInTheDocument();
    });

    it('shows data.error when present', () => {
      mockLoaded({ ...mockData, error: 'Cosmos unavailable' });
      renderPanel();
      expect(screen.getByText('Cosmos unavailable')).toBeInTheDocument();
    });

    it('says so when nothing was queued in the period, instead of empty sections', () => {
      mockLoaded(empty);
      renderPanel();
      expect(screen.getByText('Nothing queued in the past 7 days yet.')).toBeInTheDocument();
      expect(screen.queryByText('Top queuers')).toBeNull();
      expect(screen.queryByText('Top tracks')).toBeNull();
    });
  });

  describe('header and period', () => {
    it('counts what was queued from the people, not from totalEvents (which includes album adds)', () => {
      renderPanel();
      expect(screen.getByRole('heading', { level: 1, name: 'Leaderboard' })).toBeInTheDocument();
      expect(screen.getByText('17 tracks queued in the past 7 days')).toBeInTheDocument();
    });

    it('says "At least" when the server cut the people off at ten', () => {
      mockLoaded({ ...mockData, topUsers: Array.from({ length: 10 }, (_, i) => ({ userId: `u${i}`, count: 100 })) });
      renderPanel();
      expect(screen.getByText('At least 1,000 tracks queued in the past 7 days')).toBeInTheDocument();
    });

    it('defaults to the past 7 days, sharing the 50-item stats with Home', () => {
      renderPanel();
      expect(mockUseStats).toHaveBeenCalledWith('week', undefined, 50);
      expect(screen.getByRole('button', { name: 'Past 7 days' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('switches period', () => {
      renderPanel();
      fireEvent.click(screen.getByRole('button', { name: 'Today' }));
      expect(mockUseStats).toHaveBeenLastCalledWith('today', undefined, 50);
      expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(screen.getByRole('button', { name: 'All time' }));
      expect(mockUseStats).toHaveBeenLastCalledWith('alltime', undefined, 50);
      expect(screen.getByText('17 tracks queued in all')).toBeInTheDocument();
    });

    it('has no Queuedle period tab: Queuedle is its own card', () => {
      renderPanel();
      expect(screen.queryByRole('button', { name: 'Queuedle' })).toBeNull();
    });
  });

  describe('top queuers', () => {
    it('gives each person a card with their place and count, opening their profile', () => {
      renderPanel();
      expect(screen.getByText('1st · 10 queued')).toBeInTheDocument();
      expect(screen.getByText('2nd · 7 queued')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /alice/ }));
      expect(mockNavigate).toHaveBeenCalledWith('/profile/alice');
    });

    it("shows each person's own top artists for the period", async () => {
      vi.mocked(window.sonos.fetchStats).mockImplementation((_p, userId) =>
        Promise.resolve(
          userId === 'alice'
            ? {
                ...empty,
                topArtists: [
                  { artist: 'Muse', count: 24 },
                  { artist: 'Kanye West', count: 27 },
                ],
              }
            : empty
        )
      );
      renderPanel();
      const list = await screen.findByRole('list', { name: "alice's most queued artists" });
      expect(within(list).getByText('Muse')).toBeInTheDocument();
      expect(within(list).getByText('24 queued')).toBeInTheDocument();
      expect(window.sonos.fetchStats).toHaveBeenCalledWith('week', 'alice');
      expect(window.sonos.fetchStats).toHaveBeenCalledWith('week', 'bob');
    });

    it('puts 7th place onwards on one line of faces', () => {
      mockLoaded({
        ...mockData,
        topUsers: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8'].map((userId, i) => ({ userId, count: 80 - i * 10 })),
      });
      renderPanel();
      expect(screen.getByText('3rd · 60 queued')).toBeInTheDocument();
      expect(screen.getByText('6th · 30 queued')).toBeInTheDocument();
      const others = screen.getByRole('list', { name: 'Also queuing' });
      fireEvent.click(within(others).getByRole('button', { name: 'u8, 8th, 10 queued, open profile' }));
      expect(mockNavigate).toHaveBeenCalledWith('/profile/u8');
    });
  });

  describe('charts', () => {
    it('renders top tracks, artists and albums', () => {
      renderPanel();
      expect(screen.getByText('Bohemian Rhapsody')).toBeInTheDocument();
      expect(screen.getByText('Hotel California')).toBeInTheDocument();
      expect(screen.getByText('Top artists')).toBeInTheDocument();
      expect(screen.getByText('A Night at the Opera')).toBeInTheDocument();
    });

    it('queues a track with +, and hides + without a uri or a queue handler', () => {
      const onAddToQueue = vi.fn();
      renderPanel({ onAddToQueue });
      fireEvent.click(screen.getByRole('button', { name: 'Add Bohemian Rhapsody to queue' }));
      expect(onAddToQueue).toHaveBeenCalledWith(expect.objectContaining({ type: 'TRACK', title: 'Bohemian Rhapsody' }));
      expect(screen.queryByRole('button', { name: 'Add Hotel California to queue' })).toBeNull();
    });

    it('shows no + buttons when the page cannot queue', () => {
      renderPanel();
      expect(screen.queryByRole('button', { name: /to queue$/ })).toBeNull();
    });

    it('merges artists whose names differ only in case', () => {
      mockLoaded({
        ...mockData,
        topArtists: [
          { artist: 'Fontaines D.C.', count: 13 },
          { artist: 'FONTAINES D.C.', count: 11 },
        ],
      });
      renderPanel();
      const artists = screen.getByRole('region', { name: 'Top artists' });
      expect(within(artists).getByText('Fontaines D.C.')).toBeInTheDocument();
      expect(within(artists).getByText('24 queued')).toBeInTheDocument();
      expect(within(artists).queryByText('FONTAINES D.C.')).toBeNull();
    });

    it('hides Top albums when every album was queued once, since the order would be arbitrary', () => {
      mockLoaded({
        ...mockData,
        topAlbums: [
          { album: 'Once', artist: 'Band', count: 1 },
          { album: 'Also once', artist: 'Band', count: 1 },
        ],
      });
      renderPanel();
      expect(screen.queryByText('Top albums')).toBeNull();
      expect(screen.getByText('Top tracks')).toBeInTheDocument();
    });

    it('shows art when an album has an imageUrl', () => {
      mockLoaded({
        ...mockData,
        topAlbums: [
          { album: 'Pictured', artist: 'Band', albumId: 'alb2', count: 2, imageUrl: 'http://img.com/art.jpg' },
        ],
      });
      const { container } = renderPanel();
      expect(container.querySelector('img[src="http://img.com/art.jpg"]')).toBeTruthy();
    });
  });

  describe('artist navigation', () => {
    it('opens an artist with an id directly', () => {
      renderPanel();
      fireEvent.click(screen.getByRole('button', { name: 'Queen, open artist' }));
      expect(mockNavigate).toHaveBeenCalledWith('/artist/art1', expect.anything());
    });

    it('resolves an artist without an id by search', async () => {
      mockSearchResolves({ artist: { name: 'Eagles', objectId: 'eagles-id', serviceId: 'svc1', accountId: 'acc1' } });
      renderPanel();
      fireEvent.click(screen.getByRole('button', { name: 'Eagles, open artist' }));
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/artist/eagles-id', expect.anything()));
    });

    it('opens an artist from the top artists tiles', () => {
      renderPanel();
      fireEvent.click(within(screen.getByRole('region', { name: 'Top artists' })).getByText('Queen'));
      expect(mockNavigate).toHaveBeenCalledWith('/artist/art1', expect.anything());
    });

    it('links each credited artist separately and resolves the one clicked', async () => {
      mockLoaded({
        ...mockData,
        topTracks: [
          {
            trackName: 'Diz',
            artist: 'Sonny Stitt, Kenny Garrett',
            count: 2,
            artistId: 'ss',
            serviceId: 'svc1',
            accountId: 'acc1',
          },
        ],
      });
      mockSearchResolves({
        artist: { name: 'Kenny Garrett', objectId: 'kg-id', serviceId: 'svc1', accountId: 'acc1' },
      });
      renderPanel();
      expect(screen.getByRole('button', { name: 'Sonny Stitt, open artist' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Kenny Garrett, open artist' }));
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/artist/kg-id', expect.anything()));
    });
  });

  describe('album navigation', () => {
    it("opens a track's album when it has an albumId", () => {
      mockLoaded({
        ...mockData,
        topTracks: [
          {
            trackName: 'My Song',
            artist: 'Artist',
            count: 5,
            serviceId: 'svc1',
            accountId: 'acc1',
            album: 'Great Album',
            albumId: 'alb9',
          },
        ],
      });
      renderPanel();
      fireEvent.click(screen.getByRole('button', { name: 'My Song, open album' }));
      expect(mockNavigate).toHaveBeenCalledWith('/album/alb9', expect.anything());
    });

    it("resolves a track's album by search when it has no albumId", async () => {
      mockLoaded({ ...mockData, topTracks: [{ trackName: 'Track', artist: 'Artist', count: 1, album: 'Rare Album' }] });
      mockSearchResolves({
        album: { name: 'Rare Album', objectId: 'rare-id', serviceId: 'svc1', accountId: 'acc1', artistName: 'Artist' },
      });
      renderPanel();
      fireEvent.click(screen.getByRole('button', { name: 'Track, open album' }));
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/album/rare-id', expect.anything()));
    });

    it('opens an album tile', () => {
      renderPanel();
      fireEvent.click(screen.getByText('A Night at the Opera'));
      expect(mockNavigate).toHaveBeenCalledWith('/album/alb1', expect.anything());
    });

    it('resolves an album without an id to the one by the shown artist', async () => {
      mockLoaded({ ...mockData, topAlbums: [{ album: 'Greatest Hits', artist: 'Queen', count: 3 }] });
      mockSearchResolves({
        albums: [
          {
            name: 'Greatest Hits',
            objectId: 'eagles-album',
            serviceId: 'svc1',
            accountId: 'acc1',
            artistName: 'Eagles',
          },
          { name: 'Greatest Hits', objectId: 'queen-album', serviceId: 'svc1', accountId: 'acc1', artistName: 'Queen' },
        ],
      });
      renderPanel();
      fireEvent.click(screen.getByText('Greatest Hits'));
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/album/queen-album', expect.anything()));
    });
  });

  describe('Queuedle standings', () => {
    it('shows the top five by all-time average, whatever the period', () => {
      mockUseGameRankings.mockReturnValue({
        data: [ranking(), ...['b', 'c', 'd', 'e', 'f'].map((n) => ranking({ userName: n }))],
        isLoading: false,
        error: null,
      });
      const { container } = renderPanel();
      expect(mockUseGameRankings).toHaveBeenLastCalledWith(null, true);
      expect(screen.getByText('queuedle-player')).toBeInTheDocument();
      expect(screen.getAllByText('3 games')).toHaveLength(5);
      // The tier is a text chip: no raster tier art.
      expect(screen.getAllByText('Algorithm Whisperer')).toHaveLength(5);
      expect(container.querySelector('img[class*="tier"]')).toBeNull();
      // The score is labelled: a column head, and in the cell for screen readers.
      expect(screen.getByText('Avg score')).toBeInTheDocument();
      expect([...container.querySelectorAll('li [class*="average"]')].map((e) => e.textContent)).toEqual(
        Array(5).fill('4.7 average score')
      );
      expect(screen.queryByText('f')).toBeNull();
    });

    it('gives equal averages a shared place (1, 1, 3)', () => {
      mockUseGameRankings.mockReturnValue({
        data: [
          ranking({ userName: 'a', averageTotal: 16 }),
          ranking({ userName: 'b', averageTotal: 16 }),
          ranking({ userName: 'c', averageTotal: 15 }),
        ],
        isLoading: false,
        error: null,
      });
      const { container } = renderPanel();
      const places = [...container.querySelectorAll('li[class*="standing"] > span:first-child')].map(
        (e) => e.textContent
      );
      expect(places).toEqual(['01', '01', '03']);
    });

    it('shows a provisional player as provisional', () => {
      mockUseGameRankings.mockReturnValue({
        data: [ranking({ tierKey: 'provisional', tierName: 'Provisional', isProvisional: true })],
        isLoading: false,
        error: null,
      });
      renderPanel();
      expect(screen.getByText('Provisional')).toBeInTheDocument();
    });

    it('links to the full standings on the Queuedle page', () => {
      mockUseGameRankings.mockReturnValue({ data: [ranking()], isLoading: false, error: null });
      renderPanel();
      fireEvent.click(screen.getByRole('button', { name: 'See all' }));
      expect(mockNavigate).toHaveBeenCalledWith('/queuedle');
    });

    it('hides the card when nobody has played', () => {
      renderPanel();
      expect(screen.queryByText('How ranks work')).toBeNull();
    });

    it('explains the rank tiers in a dialog that closes with the button or Escape', () => {
      mockUseGameRankings.mockReturnValue({ data: [ranking()], isLoading: false, error: null });
      renderPanel();
      const opener = screen.getByRole('button', { name: 'How ranks work' });
      opener.focus();
      fireEvent.click(opener);
      const dialog = screen.getByRole('dialog', { name: 'Queuedle rank tiers' });
      expect(within(dialog).getByText(/total points earned divided by total possible points/i)).toBeInTheDocument();
      expect(within(dialog).getByText('Skip button survivor')).toBeInTheDocument();
      expect(within(dialog).getByText('85% and up')).toBeInTheDocument();
      expect(dialog.querySelector('img')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Close rank info' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      // Focus goes back to the link that opened it.
      expect(document.activeElement).toBe(opener);

      fireEvent.click(screen.getByRole('button', { name: 'How ranks work' }));
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
});
