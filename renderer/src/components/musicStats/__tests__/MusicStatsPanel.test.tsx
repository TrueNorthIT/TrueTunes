import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MusicStatsPanel } from '../MusicStatsPanel';
import { NO_LENGTHS_TEXT } from '../../../lib/musicStats';

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

const HOUR = 3_600_000;

const person = (userId: string, over: Partial<MusicPersonStats> = {}): MusicPersonStats => ({
  userId,
  queues: 100,
  trackQueues: 100,
  uniqueArtists: 30,
  variety: 0.3,
  topArtists: [{ artist: `${userId} fave`, count: 12 }],
  mostRequeued: null,
  airtimeMs: 0,
  timedQueues: 0,
  avgLengthMs: null,
  explicitPct: null,
  tasteByMonth: [{ month: '2026-09', queues: 40, topArtists: [{ artist: `${userId} September`, count: 9 }] }],
  ...over,
});

const busyHours = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
busyHours[0][9] = 312;

function fixture(withLengths: boolean): MusicStatsResult {
  const timed = (ms: number, avg: number, explicit: number, q: number) =>
    withLengths ? { airtimeMs: ms, avgLengthMs: avg, explicitPct: explicit, timedQueues: q } : {};
  return {
    generatedAt: 0,
    totalEvents: 12441,
    trackEvents: 11619,
    uniqueTracks: 7503,
    tracksWithLength: withLengths ? 6912 : 0,
    busyHours,
    people: [
      person('Alex', {
        queues: 4013,
        trackQueues: 3779,
        uniqueArtists: 334,
        variety: 0.088,
        ...timed(41.2 * HOUR, 240_000, 12, 3600),
      }),
      person('Rich', {
        queues: 1900,
        trackQueues: 1851,
        uniqueArtists: 400,
        variety: 0.216,
        ...timed(20 * HOUR, 210_000, 30, 1800),
      }),
      person('Fergus Westlake', { queues: 15, trackQueues: 14, uniqueArtists: 12, variety: 0.857 }),
    ],
    discoverers: [
      {
        artist: 'Kanye West',
        imageUrl: null,
        firstBy: 'Alex',
        firstAt: Date.UTC(2026, 5, 14, 12),
        totalQueues: 273,
        othersQueues: 153,
      },
    ],
    longest: [],
    shortest: [],
  };
}

let client: QueryClient;
function renderPanel() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MusicStatsPanel />
    </QueryClientProvider>
  );
}

const sectionOf = (title: string) => screen.getByRole('heading', { name: title }).closest('section') as HTMLElement;

beforeEach(() => {
  vi.mocked(window.sonos.getDisplayName).mockResolvedValue('Rich');
  vi.mocked(window.sonos.fetchMusicStats).mockReset();
});

describe('MusicStatsPanel', () => {
  it('shows the header counts and airtime labels', async () => {
    vi.mocked(window.sonos.fetchMusicStats).mockResolvedValue(fixture(true));
    renderPanel();
    expect(await screen.findByText('12,441 queues · 3 people')).toBeInTheDocument();
    const airtime = sectionOf('Airtime');
    expect(within(airtime).getByText('41.2 h')).toBeInTheDocument();
    expect(within(airtime).getByText(/Lengths known for 6,912 of 7,503 songs/)).toBeInTheDocument();
    expect(within(sectionOf('Discoverers')).getByText(/since then queued 153 times by others/)).toBeInTheDocument();
  });

  it('leaves people with fewer than 20 track queues off the variety chart', async () => {
    vi.mocked(window.sonos.fetchMusicStats).mockResolvedValue(fixture(true));
    renderPanel();
    await screen.findByText('12,441 queues · 3 people');
    const variety = sectionOf('Variety');
    expect(within(variety).getByText('Alex')).toBeInTheDocument();
    expect(within(variety).getByText('334 artists from 3,779 songs')).toBeInTheDocument();
    expect(within(variety).queryByText('Fergus Westlake')).toBeNull();
  });

  it('shows an empty state for the length sections when no lengths are known', async () => {
    vi.mocked(window.sonos.fetchMusicStats).mockResolvedValue(fixture(false));
    renderPanel();
    await screen.findByText('12,441 queues · 3 people');
    expect(within(sectionOf('Airtime')).getByText(NO_LENGTHS_TEXT)).toBeInTheDocument();
    expect(within(sectionOf('Song length')).getByText(NO_LENGTHS_TEXT)).toBeInTheDocument();
    expect(within(sectionOf('Longest songs')).getByText(NO_LENGTHS_TEXT)).toBeInTheDocument();
    expect(screen.queryByText(/Lengths known for/)).toBeNull();
  });

  it('defaults the taste picker to you and switches person on click', async () => {
    vi.mocked(window.sonos.fetchMusicStats).mockResolvedValue(fixture(true));
    renderPanel();
    const taste = await screen
      .findByRole('heading', { name: 'Taste over time' })
      .then((h) => h.closest('section') as HTMLElement);
    expect(await within(taste).findByText('Rich September')).toBeInTheDocument();
    fireEvent.click(within(taste).getByRole('button', { name: 'Alex' }));
    expect(within(taste).getByRole('button', { name: 'Alex' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(taste).getByText('Alex September')).toBeInTheDocument();
    expect(within(taste).queryByText('Rich September')).toBeNull();
  });

  it('shows an error state when the server replies with an error', async () => {
    vi.mocked(window.sonos.fetchMusicStats).mockResolvedValue({ error: 'nope' });
    renderPanel();
    expect(await screen.findByText(/Couldn’t load the music stats/)).toBeInTheDocument();
  });

  it('keeps showing the stats when a later refresh fails', async () => {
    vi.mocked(window.sonos.fetchMusicStats).mockResolvedValueOnce(fixture(true));
    renderPanel();
    expect(await screen.findByText(/12,441 queues/)).toBeInTheDocument();
    vi.mocked(window.sonos.fetchMusicStats).mockResolvedValue({ error: 'Not Found' });
    await act(() => client.refetchQueries({ queryKey: ['music-stats'] }));
    expect(await screen.findByText(/Couldn’t refresh just now/)).toBeInTheDocument();
    expect(screen.queryByText(/Couldn’t load the music stats/)).toBeNull();
    expect(screen.getByText(/12,441 queues/)).toBeInTheDocument();
  });
});
