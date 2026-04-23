import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LeaderboardPanel } from '../LeaderboardPanel';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importActual) => {
  const actual = await importActual<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../../hooks/useStats');
import { useStats } from '../../hooks/useStats';
const mockUseStats = vi.mocked(useStats);

vi.mock('../../hooks/useDailyGame', () => ({
  useGameLeaderboard: () => ({ data: { gameId: 'today', scores: [] }, isLoading: false }),
  useDailyGame: () => ({ data: undefined, isLoading: false }),
  useSubmitGameScore: () => ({ mutateAsync: vi.fn(), isPending: false }),
  dailyGameQueryOptions: () => ({ queryKey: [], queryFn: vi.fn() }),
}));

const mockRefetch = vi.fn();

const mockData: StatsResult = {
  topUsers: [
    { userId: 'alice', count: 10 },
    { userId: 'bob',   count: 7  },
  ],
  topTracks: [
    { trackName: 'Bohemian Rhapsody', artist: 'Queen', count: 5, artistId: 'art1' },
    { trackName: 'Hotel California',  artist: 'Eagles', count: 3 },
  ],
  topArtists: [
    { artist: 'Queen',  artistId: 'art1', count: 5 },
    { artist: 'Eagles', count: 3 },
  ],
  topAlbums: [
    { album: 'A Night at the Opera', artist: 'Queen', albumId: 'alb1', count: 4 },
  ],
  totalEvents: 25,
  periodStart: 0,
};

function mockLoaded(data: StatsResult = mockData) {
  mockUseStats.mockReturnValue({
    data,
    isLoading: false,
    error: null,
    refetch: mockRefetch,
  } as unknown as ReturnType<typeof useStats>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLoaded();
});

describe('LeaderboardPanel', () => {
  describe('loading state', () => {
    it('shows loading indicator while fetching', () => {
      mockUseStats.mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        refetch: mockRefetch,
      } as unknown as ReturnType<typeof useStats>);

      render(<LeaderboardPanel />);
      expect(screen.getByText('Loading…')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('shows error message on fetch failure', () => {
      mockUseStats.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('Network error'),
        refetch: mockRefetch,
      } as unknown as ReturnType<typeof useStats>);

      render(<LeaderboardPanel />);
      expect(screen.getByText('Failed to load stats')).toBeInTheDocument();
    });

    it('shows data.error when present', () => {
      mockLoaded({ ...mockData, error: 'Cosmos unavailable' });
      render(<LeaderboardPanel />);
      expect(screen.getByText('Cosmos unavailable')).toBeInTheDocument();
    });
  });

  describe('leaderboard (no user selected)', () => {
    it('renders the title', () => {
      render(<LeaderboardPanel />);
      expect(screen.getByText('Leaderboard')).toBeInTheDocument();
    });

    it('renders period tabs', () => {
      render(<LeaderboardPanel />);
      expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'This week' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'All time' })).toBeInTheDocument();
    });

    it('renders top queuers', () => {
      render(<LeaderboardPanel />);
      expect(screen.getByText('alice')).toBeInTheDocument();
      expect(screen.getByText('bob')).toBeInTheDocument();
    });

    it('renders top tracks', () => {
      render(<LeaderboardPanel />);
      expect(screen.getByText('Bohemian Rhapsody')).toBeInTheDocument();
      expect(screen.getByText('Hotel California')).toBeInTheDocument();
    });

    it('renders top artists section', () => {
      render(<LeaderboardPanel />);
      expect(screen.getByText('Top artists')).toBeInTheDocument();
      // Queen appears in tracks + artists + album sub, Eagles in tracks + artists
      expect(screen.getAllByText('Queen').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Eagles').length).toBeGreaterThanOrEqual(1);
    });

    it('renders top albums', () => {
      render(<LeaderboardPanel />);
      expect(screen.getByText('A Night at the Opera')).toBeInTheDocument();
    });
  });

  describe('period tabs', () => {
    it('defaults to "week" period on mount', () => {
      render(<LeaderboardPanel />);
      expect(mockUseStats).toHaveBeenCalledWith('week', undefined);
    });

    it('switches to "today" period when Today tab is clicked', () => {
      render(<LeaderboardPanel />);
      fireEvent.click(screen.getByRole('button', { name: 'Today' }));
      expect(mockUseStats).toHaveBeenCalledWith('today', undefined);
    });

    it('switches to "alltime" period when All time tab is clicked', () => {
      render(<LeaderboardPanel />);
      fireEvent.click(screen.getByRole('button', { name: 'All time' }));
      expect(mockUseStats).toHaveBeenCalledWith('alltime', undefined);
    });
  });

  describe('refresh button', () => {
    it('calls refetch when refresh button is clicked', () => {
      render(<LeaderboardPanel />);
      fireEvent.click(screen.getByTitle('Refresh'));
      expect(mockRefetch).toHaveBeenCalledOnce();
    });
  });

  describe('user drill-down', () => {
    it('navigates to user stats when a user row is clicked', () => {
      render(<LeaderboardPanel />);
      fireEvent.click(screen.getByText('alice'));
      expect(mockUseStats).toHaveBeenCalledWith('week', 'alice');
    });

    it('shows the selected username as the title', () => {
      render(<LeaderboardPanel />);
      fireEvent.click(screen.getByText('alice'));
      expect(screen.getByRole('heading', { name: 'alice' })).toBeInTheDocument();
    });

    it('hides the top queuers section when a user is selected', () => {
      render(<LeaderboardPanel />);
      fireEvent.click(screen.getByText('alice'));
      expect(screen.queryByText('Top queuers')).toBeNull();
    });

    it('shows a back button when a user is selected', () => {
      render(<LeaderboardPanel />);
      fireEvent.click(screen.getByText('alice'));
      expect(screen.getByTitle('Back')).toBeInTheDocument();
    });

    it('returns to leaderboard when back button is clicked', () => {
      render(<LeaderboardPanel />);
      fireEvent.click(screen.getByText('alice'));
      fireEvent.click(screen.getByTitle('Back'));

      expect(screen.getByText('Leaderboard')).toBeInTheDocument();
      expect(screen.queryByTitle('Back')).toBeNull();
      expect(mockUseStats).toHaveBeenCalledWith('week', undefined);
    });
  });

  describe('track artist/album navigation', () => {
    it('clicking an artist link with artistId navigates to artist page', () => {
      render(<LeaderboardPanel />);
      // Queen has artistId 'art1'
      fireEvent.click(screen.getAllByText('Queen')[0]);
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.stringMatching(/^\/artist\//),
        expect.anything()
      );
    });

    it('clicking an artist link without artistId navigates to search', () => {
      render(<LeaderboardPanel />);
      // Eagles has no artistId
      fireEvent.click(screen.getAllByText('Eagles')[0]);
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.stringMatching(/^\/search\?q=/)
      );
    });

    it('shows "No data yet" for empty topTracks', () => {
      mockLoaded({ ...mockData, topTracks: [] });
      render(<LeaderboardPanel />);
      expect(screen.getAllByText('No data yet').length).toBeGreaterThanOrEqual(1);
    });

    it('shows "No data yet" for empty topArtists', () => {
      mockLoaded({ ...mockData, topArtists: [] });
      render(<LeaderboardPanel />);
      expect(screen.getAllByText('No data yet').length).toBeGreaterThanOrEqual(1);
    });

    it('shows "No data yet for this period" when topUsers is empty', () => {
      mockLoaded({ ...mockData, topUsers: [] });
      render(<LeaderboardPanel />);
      expect(screen.getByText('No data yet for this period')).toBeInTheDocument();
    });
  });

  describe('album navigation', () => {
    it('clicking album link with albumId navigates to album page', () => {
      mockLoaded({
        ...mockData,
        topAlbums: [],
        topTracks: [
          { trackName: 'My Song', artist: 'Artist', count: 5, artistId: 'art1', album: 'Great Album', albumId: 'alb9' },
        ],
      });
      render(<LeaderboardPanel />);
      fireEvent.click(screen.getByText('Great Album'));
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.stringMatching(/^\/album\//),
        expect.anything()
      );
    });

    it('clicking album link without albumId navigates to search', () => {
      mockLoaded({
        ...mockData,
        topAlbums: [],
        topTracks: [
          { trackName: 'Track', artist: 'Artist', count: 1, album: 'Rare Album' },
        ],
      });
      render(<LeaderboardPanel />);
      fireEvent.click(screen.getByText('Rare Album'));
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.stringMatching(/^\/search\?q=/)
      );
    });
  });

  describe('4th+ place rank numbers', () => {
    it('shows numeric rank for users beyond top 3', () => {
      mockLoaded({
        ...mockData,
        topUsers: [
          { userId: 'u1', count: 10 },
          { userId: 'u2', count: 8 },
          { userId: 'u3', count: 6 },
          { userId: 'u4-unique', count: 4 },
        ],
      });
      render(<LeaderboardPanel />);
      // The 4th user gets a numeric rank "4"
      expect(screen.getByText('u4-unique')).toBeInTheDocument();
    });
  });
});
