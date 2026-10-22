import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProfilePanel } from '../ProfilePanel';

const track = (trackName: string, count: number) => ({
  trackName, artist: 'Muse', album: 'Absolution', albumId: 'al1', serviceId: 's', accountId: 'a', uri: `uri:${trackName}`, count,
});

function stats(over: Partial<StatsResult> = {}): StatsResult {
  return { topUsers: [], topTracks: [], topArtists: [], topAlbums: [], totalEvents: 0, periodStart: 0, ...over };
}

function renderProfile(userName: string, displayName = 'Joe') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/profile/${encodeURIComponent(userName)}`]}>
        <Routes>
          <Route
            path="/profile/:userName"
            element={<ProfilePanel onAddToQueue={vi.fn()} displayName={displayName} onSignOut={vi.fn()} onChangeName={vi.fn(async () => null)} />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ProfilePanel', () => {
  beforeEach(() => {
    vi.mocked(window.sonos.fetchStats).mockReset();
    vi.mocked(window.sonos.fetchStats).mockImplementation(async (period, userId) => {
      if (!userId) return stats({ topUsers: [{ userId: 'Alex', count: 90 }, { userId: 'Rich', count: 50 }], totalEvents: 140 });
      if (period === 'week') return stats({ topUsers: [{ userId: userId, count: 7 }], totalEvents: 9 });
      // totalEvents counts album-add events too; the queued count is the topUsers one, as on the Leaderboard.
      return stats({ topUsers: [{ userId: userId, count: 967 }], topTracks: [track('Hysteria', 9), track('Time Is Running Out', 4)], totalEvents: 1035 });
    });
    vi.mocked(window.sonos.fetchRecentlyPlayed).mockResolvedValue({
      tracks: [{ trackName: 'Starlight', artist: 'Muse', lastPlayed: Date.now() }],
      artists: [],
      albums: [],
    });
  });

  it('leads with the name and their place in the office', async () => {
    renderProfile('Rich');
    expect(screen.getByRole('heading', { level: 1, name: 'Rich' })).toBeInTheDocument();
    expect(await screen.findByText('2nd most active in the office')).toBeInTheDocument();
    expect(await screen.findByText('967 queued')).toBeInTheDocument();
    expect(screen.getByText('7 in the past 7 days')).toBeInTheDocument();
  });

  it('ranks the top tracks and lists what they queued lately', async () => {
    renderProfile('Rich');
    const top = await screen.findByRole('region', { name: 'Top tracks' });
    expect(await within(top).findByText('Hysteria')).toBeInTheDocument();
    expect(within(top).getAllByRole('listitem')).toHaveLength(2);
    const lately = await screen.findByRole('region', { name: 'Lately' });
    expect(within(lately).getByText('Starlight')).toBeInTheDocument();
    expect(within(lately).getByText('Today')).toBeInTheDocument();
  });

  it('offers name, photo and sign-out only on your own profile', async () => {
    const { unmount } = renderProfile('Rich');
    expect(screen.queryByRole('button', { name: 'Change name' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change your photo' })).toBeNull();
    unmount();

    renderProfile('Joe');
    expect(screen.getByRole('button', { name: 'Change name' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change your photo' })).toBeInTheDocument();
  });

  it('moves "last queued" into the facts and drops Lately when nothing is from the past week', async () => {
    vi.mocked(window.sonos.fetchRecentlyPlayed).mockResolvedValue({ tracks: [], artists: [], albums: [] });
    vi.mocked(window.sonos.fetchUsers).mockResolvedValue([{ userId: 'Rich', lastQueued: Date.now() - 21 * 86_400_000 }]);
    renderProfile('Rich');
    expect(await screen.findByText('Last queued 3 weeks ago')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Lately' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Top tracks' })).toBeInTheDocument();
  });

  it('says so when someone has queued nothing', async () => {
    vi.mocked(window.sonos.fetchStats).mockImplementation(async () => stats());
    vi.mocked(window.sonos.fetchRecentlyPlayed).mockResolvedValue(null);
    renderProfile('Aidan');
    expect(await screen.findByText('Aidan hasn’t queued anything yet.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Top tracks' })).toBeNull();
  });
});
