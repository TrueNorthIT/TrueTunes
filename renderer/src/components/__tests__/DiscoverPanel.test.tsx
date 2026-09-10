import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DiscoverPanel } from '../DiscoverPanel';

// The real hook resolves a cached blob URL; echoing the input keeps the
// with-photo / without-photo branches distinguishable in tests.
vi.mock('../../hooks/useImage', () => ({ useImage: (url: string | null) => url ?? null }));

const onAddToQueue = vi.fn();

const djSet: DjSetResult = {
  tracks: [
    {
      uri: 'uri-1',
      trackName: 'Left Hand Free',
      artist: 'alt-J',
      serviceId: '72711',
      accountId: '13',
      score: 0.73,
      because: 'Alex and Joe Pitts queue alt-J',
    },
    {
      uri: 'uri-2',
      trackName: 'Summer',
      artist: 'Calvin Harris',
      serviceId: '72711',
      accountId: '13',
      score: 0.54,
      because: 'Joe Pitts and Alex queue Calvin Harris',
    },
  ],
  artists: [],
  listeners: ['Joe Pitts', 'Alex'],
  artistsConsidered: 409,
  inferredListeners: true,
};

/** The panel opens on New music; the history-based list is a click away. */
async function showFavourites() {
  await userEvent.click(screen.getByText('Favourites'));
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DiscoverPanel onAddToQueue={onAddToQueue} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(window.sonos.fetchDjSet).mockResolvedValue(djSet);
  vi.mocked(window.sonos.fetchOfficePresence).mockResolvedValue({
    inOffice: [], basis: 'none', observed: 0, detail: [],
  });
  vi.mocked(window.sonos.fetchUsers).mockResolvedValue([
    { userId: 'Rich', lastQueued: 1, imageUrl: 'https://example.test/rich.png' },
    { userId: 'Alex', lastQueued: 2, imageUrl: null },
  ] as UserSummary[]);
});

describe('DiscoverPanel', () => {
  it('lists each pick with the reason it was chosen', async () => {
    renderPanel();
    await showFavourites();
    expect(await screen.findByText('Left Hand Free')).toBeInTheDocument();
    expect(screen.getByText('Alex and Joe Pitts queue alt-J')).toBeInTheDocument();
  });

  /**
   * The important one. DJ picks are the algorithm's choice, not the clicker's:
   * attributing them would credit whoever pressed the button on the leaderboard,
   * give Queuedle wrong answers for "who queued this?", and feed the recommender
   * its own output until the event corpus is mostly self-generated.
   */
  it('never attributes a single pick to the person who queued it', async () => {
    renderPanel();
    await showFavourites();
    await screen.findByText('Left Hand Free');

    await userEvent.click(screen.getAllByTitle('Add to queue')[0]);

    expect(onAddToQueue).toHaveBeenCalledTimes(1);
    expect(onAddToQueue).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Left Hand Free' }),
      -1,
      { attribute: false },
    );
  });

  it('never attributes picks queued in bulk', async () => {
    renderPanel();
    await showFavourites();
    await screen.findByText('Left Hand Free');

    await userEvent.click(screen.getByTitle('Add every pick to the queue'));

    await waitFor(() => expect(onAddToQueue).toHaveBeenCalledTimes(2));
    for (const call of onAddToQueue.mock.calls) {
      expect(call[2]).toEqual({ attribute: false });
    }
  });

  it('shows a face next to each name in the room picker', async () => {
    renderPanel();
    await showFavourites();
    await screen.findByText('Left Hand Free');

    // Someone with a photo gets the image; someone without falls back to their
    // initial on a per-name gradient rather than an empty circle.
    // Chip titles now carry presence detail, e.g. "Rich — in the office, Available".
    const rich = await screen.findByTitle(/^Rich —/);
    expect(rich.querySelector('img')).toBeTruthy();

    const alex = await screen.findByTitle(/^Alex —/);
    expect(alex.querySelector('img')).toBeFalsy();
    expect(alex.textContent).toContain('A');
  });

  it('shows the inferred room rather than claiming the whole office', async () => {
    renderPanel();
    expect(await screen.findByText(/whoever's been queueing today \(2\)/)).toBeInTheDocument();
  });

  it('explains itself when there is not enough history', async () => {
    vi.mocked(window.sonos.fetchDjSet).mockResolvedValue({
      tracks: [],
      artists: [],
      listeners: [],
      artistsConsidered: 0,
      inferredListeners: true,
    });
    renderPanel();
    await showFavourites();
    expect(await screen.findByText(/Not enough history yet/)).toBeInTheDocument();
  });

  it('opens on new music rather than the office back catalogue', async () => {
    renderPanel();
    // The tab is Discover — its default view should be the music the office
    // hasn't played, with favourites available as an aside.
    expect(
      await screen.findByText(/Nothing new found|Digging for something new/),
    ).toBeInTheDocument();
  });

  it('splits the room from everyone else', async () => {
    vi.mocked(window.sonos.fetchOfficePresence).mockResolvedValue({
      inOffice: ['Rich'],
      basis: 'sensed',
      observed: 1,
      detail: [
        { userId: 'Rich', availability: 'Available', workLocationType: 'office', source: 'automatic' },
        { userId: 'Alex', availability: 'Available', workLocationType: 'remote', source: 'scheduled' },
      ],
    });

    renderPanel();

    // A flat list gave no clue which names were actually driving the picks.
    expect(await screen.findByText('In the office')).toBeInTheDocument();
    expect(screen.getByText('Not in today')).toBeInTheDocument();
    expect(screen.getByTitle('Rich — in the office, Available')).toBeInTheDocument();
    expect(screen.getByTitle('Alex — working remotely, Available')).toBeInTheDocument();
  });

  it('marks which of them is you', async () => {
    vi.mocked(window.sonos.fetchOfficePresence).mockResolvedValue({
      inOffice: ['Rich'], basis: 'sensed', observed: 1, detail: [],
    });

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <DiscoverPanel onAddToQueue={onAddToQueue} displayName="Rich" />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('you')).toBeInTheDocument();
  });

  it('says so plainly when someone has no Teams presence at all', async () => {
    vi.mocked(window.sonos.fetchOfficePresence).mockResolvedValue({
      inOffice: [], basis: 'none', observed: 0, detail: [],
    });

    renderPanel();
    expect(await screen.findByTitle('Rich — no Teams presence')).toBeInTheDocument();
  });

  /**
   * `users:list` excludes the signed-in user by default — HomePanel wants
   * "other people". The room picker wants everyone, you included, or you can't
   * see or deselect yourself.
   */
  it('asks for the full room, itself included', async () => {
    renderPanel();
    await waitFor(() => expect(window.sonos.fetchUsers).toHaveBeenCalled());
    expect(window.sonos.fetchUsers).toHaveBeenCalledWith(true);
  });
});
