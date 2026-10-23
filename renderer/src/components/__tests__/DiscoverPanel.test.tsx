import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { DiscoverPanel } from '../DiscoverPanel';
import type { DjActDiscoveries } from '../../hooks/useDjDiscoveries';
import type { AlbumTrack } from '../../hooks/useAlbumBrowse';

// The real hook resolves a cached blob URL; echoing the input keeps the
// with-photo / without-photo branches distinguishable in tests.
vi.mock('../../hooks/useImage', () => ({ useImage: (url: string | null) => url ?? null }));

const showToast = vi.fn();
vi.mock('../common/Toast', () => ({ useToast: () => ({ showToast }) }));

const removeFromQueue = vi.fn().mockResolvedValue(undefined);
vi.mock('../../providers', () => ({ getActiveProvider: () => ({ removeFromQueue }) }));

// Browsing each act is the hook's job (and its pure logic is tested in lib/discover); here it's a fixture.
const mockDiscoveries = vi.fn();
vi.mock('../../hooks/useDjDiscoveries', () => ({ useDjDiscoveries: (...args: unknown[]) => mockDiscoveries(...args) }));

const onAddToQueue = vi.fn();

const track = (title: string): AlbumTrack => ({
  title,
  ordinal: 0,
  durationSeconds: 200,
  artUrl: null,
  id: { objectId: `id-${title}`, serviceId: '72711', accountId: '13' },
  artists: [],
  albumName: null,
  albumId: null,
  explicit: false,
  raw: { title, type: 'ITEM_TRACK' } as never,
});
const act = (artist: string, because: string): DjArtist => ({
  artist, artistId: artist, serviceId: '72711', accountId: '13', score: 1, because, heardTrackKeys: [],
});
const groups: DjActDiscoveries[] = [
  { act: act('Muse', 'Rich, Alex and others queue Muse'), tracks: [track('Hysteria'), track('Madness')], imageUrl: null },
  { act: act('Jungle', 'Alex queues Jungle'), tracks: [track('Back On 74')], imageUrl: null },
];
const discoveries = [
  { track: groups[0].tracks[0], artist: 'Muse', because: 'x', score: 1 },
  { track: groups[1].tracks[0], artist: 'Jungle', because: 'x', score: 1 },
  { track: groups[0].tracks[1], artist: 'Muse', because: 'x', score: 1 },
];

const djSet: DjSetResult = {
  tracks: [],
  artists: groups.map((g) => g.act),
  listeners: ['Rich', 'Alex'],
  artistsConsidered: 409,
  inferredListeners: true,
};

function renderPanel(props: Partial<React.ComponentProps<typeof DiscoverPanel>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DiscoverPanel onAddToQueue={onAddToQueue} {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDiscoveries.mockReturnValue({ discoveries, groups, isLoading: false });
  vi.mocked(window.sonos.fetchDjSet).mockResolvedValue(djSet);
  vi.mocked(window.sonos.fetchOfficePresence).mockResolvedValue({
    inOffice: [], basis: 'none', observed: 0, detail: [],
  });
  vi.mocked(window.sonos.fetchUsers).mockResolvedValue([
    { userId: 'Rich', lastQueued: 1, imageUrl: 'https://example.test/rich.png' },
    { userId: 'Alex', lastQueued: 2, imageUrl: null },
    { userId: 'Sam', lastQueued: 3, imageUrl: null },
  ] as UserSummary[]);
});

describe('DiscoverPanel', () => {
  it('groups the unheard tracks by act, with who is behind each act', async () => {
    renderPanel();
    const muse = (await screen.findByRole('button', { name: 'Open Muse' }, { timeout: 4000 })).parentElement as HTMLElement;
    expect(within(muse).getByText('Rich, Alex and others')).toBeInTheDocument();
    expect(within(muse).getByText('Hysteria')).toBeInTheDocument();
    expect(within(muse).getByText('Madness')).toBeInTheDocument();
    expect(within(muse).queryByText('Back On 74')).toBeNull();
    // "Never played here" is the page's premise, said once, not on every row.
    expect(screen.getByText(/never played, by acts the room already likes/)).toBeInTheDocument();
    expect(screen.queryByText(/never played here/i)).toBeNull();
  });

  it('REQ-W7/W8: the info icon on an act card explains it without opening the act or queuing', async () => {
    renderPanel();
    const [info] = await screen.findAllByRole('button', { name: 'Why this pick' }, { timeout: 4000 });
    await userEvent.hover(info);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Rich');
    await userEvent.click(info);
    expect(onAddToQueue).not.toHaveBeenCalled();
  });

  /**
   * The important one. DJ picks are the algorithm's choice, not the clicker's:
   * attributing them would credit whoever pressed the button on the leaderboard,
   * give Queuedle wrong answers for "who queued this?", and feed the recommender
   * its own output until the event corpus is mostly self-generated.
   */
  it('never attributes a single pick to the person who queued it', async () => {
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Add Hysteria to queue' }));
    expect(onAddToQueue).toHaveBeenCalledTimes(1);
    expect(onAddToQueue).toHaveBeenCalledWith(expect.objectContaining({ title: 'Hysteria' }), -1, { attribute: false });
  });

  it('queues all unattributed, interleaved by act, with an undo', async () => {
    const queueItems = ['Hysteria', 'Back On 74', 'Madness'].map((title, i) => ({
      index: i,
      track: { id: `id-${title}`, title, artist: title === 'Back On 74' ? 'Jungle' : 'Muse' },
    })) as never;
    renderPanel({ queueItems });
    const button = await screen.findByTitle('Add every pick to the queue');
    // Honest about how many: exactly the tracks on the page.
    expect(button).toHaveTextContent('Queue all (3)');
    await userEvent.click(button);

    expect(onAddToQueue.mock.calls.map((c) => c[0].title)).toEqual(['Hysteria', 'Back On 74', 'Madness']);
    for (const call of onAddToQueue.mock.calls) expect(call[2]).toEqual({ attribute: false });

    expect(showToast).toHaveBeenCalledWith('Queued 3 tracks', 'info', expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) }));
    showToast.mock.calls[0][2].action.onClick();
    expect(removeFromQueue).toHaveBeenCalledWith([0, 1, 2]);
  });

  it('shows a face next to each name in the room', async () => {
    renderPanel();
    // Someone with a photo gets the image; someone without falls back to their initial.
    const rich = await screen.findByTitle('Rich — no Teams presence');
    expect(rich.querySelector('img')).toBeTruthy();
    const alex = screen.getByTitle('Alex — no Teams presence');
    expect(alex.querySelector('img')).toBeFalsy();
    expect(alex.textContent).toContain('A');
  });

  it("says so in one line when presence detects nobody, rather than calling everyone away", async () => {
    renderPanel();
    expect(await screen.findByText(/Nobody's been detected in the office, so this is for whoever's been queueing today/)).toBeInTheDocument();
    expect(screen.queryByText(/not in today/i)).toBeNull();
    // The two who've been queueing lead; Sam waits behind +1.
    expect(await screen.findByRole('button', { name: /^Rich/, pressed: true })).toBeInTheDocument();
    expect(screen.queryByTitle('Sam — no Teams presence')).toBeNull();
  });

  it('collapses everyone else behind +N, which expands', async () => {
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

    expect(await screen.findByTitle('Rich — in the office, Available')).toBeInTheDocument();
    expect(screen.queryByTitle('Alex — working remotely, Available')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '+2' }));
    const alex = screen.getByTitle('Alex — working remotely, Available');
    expect(alex).toHaveAttribute('aria-pressed', 'false');
  });

  it('lets you choose who it is for, starting from who is in', async () => {
    vi.mocked(window.sonos.fetchOfficePresence).mockResolvedValue({
      inOffice: ['Rich'], basis: 'sensed', observed: 1, detail: [],
    });
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: '+2' }));
    await userEvent.click(screen.getByTitle('Alex — no Teams presence'));

    await waitFor(() =>
      expect(window.sonos.fetchDjSet).toHaveBeenLastCalledWith(expect.objectContaining({ users: ['Rich', 'Alex'] })),
    );
    expect(screen.getByTitle('Alex — no Teams presence')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: "Back to who's in" })).toBeInTheDocument();
  });

  it('keeps the cards, dimmed, while a new room loads instead of flashing a skeleton', async () => {
    vi.mocked(window.sonos.fetchOfficePresence).mockResolvedValue({
      inOffice: ['Rich'], basis: 'sensed', observed: 1, detail: [],
    });
    renderPanel();
    await screen.findByRole('button', { name: 'Open Muse' }, { timeout: 4000 });
    vi.mocked(window.sonos.fetchDjSet).mockReturnValue(new Promise(() => {}));
    await userEvent.click(await screen.findByRole('button', { name: '+2' }));
    await userEvent.click(screen.getByTitle('Alex — no Teams presence'));

    expect(screen.getByRole('button', { name: 'Open Muse' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Muse' }).closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true');
    // Don't bulk-queue a set that's about to change.
    expect(screen.getByTitle('Add every pick to the queue')).toBeDisabled();
  });

  it('collapses a big room to eight faces and +N', async () => {
    const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
    vi.mocked(window.sonos.fetchUsers).mockResolvedValue(names.map((userId) => ({ userId, lastQueued: 1, imageUrl: null })) as UserSummary[]);
    vi.mocked(window.sonos.fetchOfficePresence).mockResolvedValue({ inOffice: names, basis: 'sensed', observed: 10, detail: [] });
    renderPanel();
    expect(await screen.findByRole('button', { name: '+2' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(8);
    await userEvent.click(screen.getByRole('button', { name: '+2' }));
    // The two hidden were still in the set.
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(10);
  });

  it('leaves out what is already queued, and shuffles to other songs', async () => {
    const queueItems = [{ index: 0, track: { id: 'q1', title: 'Explorer', artist: 'Connan Mockasin' } }] as never;
    renderPanel({ queueItems });
    await waitFor(() =>
      expect(mockDiscoveries).toHaveBeenLastCalledWith(
        djSet.artists,
        true,
        { queued: [{ title: 'Explorer', artist: 'Connan Mockasin' }], round: 0 },
      ),
    );
    await userEvent.click(screen.getByRole('button', { name: /Shuffle/ }));
    expect(mockDiscoveries).toHaveBeenLastCalledWith(djSet.artists, true, expect.objectContaining({ round: 1 }));
  });

  it('says plainly when the set could not be built, with a retry, not the raw error', async () => {
    mockDiscoveries.mockReturnValue({ discoveries: [], groups: [], isLoading: false });
    vi.mocked(window.sonos.fetchDjSet).mockResolvedValue({ error: 'ECONNRESET socket hang up' });
    renderPanel();
    expect(await screen.findByText("Couldn't load picks right now")).toBeInTheDocument();
    expect(screen.queryByText(/ECONNRESET/)).toBeNull();
    const calls = vi.mocked(window.sonos.fetchDjSet).mock.calls.length;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(vi.mocked(window.sonos.fetchDjSet).mock.calls.length).toBeGreaterThan(calls));
  });

  it('marks which of them is you', async () => {
    renderPanel({ displayName: 'Rich' });
    expect(await screen.findByText('(you)')).toBeInTheDocument();
  });

  it('explains itself when there is nothing new to suggest', async () => {
    mockDiscoveries.mockReturnValue({ discoveries: [], groups: [], isLoading: false });
    renderPanel();
    expect(await screen.findByText('Nothing new to suggest')).toBeInTheDocument();
  });

  it('explains itself when there is not enough history', async () => {
    mockDiscoveries.mockReturnValue({ discoveries: [], groups: [], isLoading: false });
    vi.mocked(window.sonos.fetchDjSet).mockResolvedValue({ ...djSet, artists: [], listeners: [] });
    renderPanel();
    expect(await screen.findByText('Not enough history yet')).toBeInTheDocument();
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
