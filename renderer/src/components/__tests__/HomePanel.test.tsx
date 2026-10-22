import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, fireEvent, within, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const homeCss = readFileSync(resolve(__dirname, '../../styles/HomePanel.module.css'), 'utf-8');
import { HomePanel, fetchYtmSections } from '../HomePanel';
import type { SonosItem } from '../../types/sonos';

const mockServiceQuery = vi.fn();
const mockBrowseContainer = vi.fn();

const mockUseLocation = vi.fn();
const mockUseSearchParams = vi.fn();
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useLocation: () => mockUseLocation(),
  useSearchParams: () => mockUseSearchParams(),
  useNavigate: () => mockNavigate,
}));

const mockOpenItem = vi.fn();
vi.mock('../../hooks/useOpenItem', () => ({ useOpenItem: () => mockOpenItem }));

const mockAlbumQueryOptions = vi.fn(() => ({ queryKey: ['album-test'], queryFn: async () => null }));
const mockArtistQueryOptions = vi.fn(() => ({ queryKey: ['artist-test'], queryFn: async () => null }));
vi.mock('../../hooks/useAlbumBrowse', () => ({ albumQueryOptions: () => mockAlbumQueryOptions() }));
const mockArtistPhoto = vi.fn((_id?: string): string | null => null);
vi.mock('../../hooks/useArtistBrowse', () => ({
  artistQueryOptions: () => mockArtistQueryOptions(),
  artistImageQueryOptions: (id?: string) => ({ queryKey: ['artist-image', id], queryFn: async () => mockArtistPhoto(id), enabled: !!id }),
}));

vi.mock('../../lib/sonosApi', () => ({
  api: {
    browse: { container: (...args: unknown[]) => mockBrowseContainer(...args) },
    search: { serviceQuery: (...args: unknown[]) => mockServiceQuery(...args) },
  },
}));


const mockShowToast = vi.fn();
vi.mock('../common/Toast', () => ({ useToast: () => ({ showToast: mockShowToast }) }));
const mockRemoveFromQueue = vi.fn(async () => {});
vi.mock('../../providers', () => ({ getActiveProvider: () => ({ removeFromQueue: mockRemoveFromQueue }) }));

const mockUseOfficePresence = vi.fn();
const mockUseDjSet = vi.fn();
const mockUseDjDiscoveries = vi.fn();
const mockUseStats = vi.fn();
const mockUseUsers = vi.fn();
const mockUseDailyGame = vi.fn();
const mockUseMyScore = vi.fn();
const mockUseRecentTracksByUser = vi.fn();
vi.mock('../../hooks/useOfficePresence', () => ({ useOfficePresence: () => mockUseOfficePresence() }));
vi.mock('../../hooks/useDjSet', () => ({ useDjSet: () => mockUseDjSet() }));
vi.mock('../../hooks/useDjDiscoveries', () => ({ useDjDiscoveries: () => mockUseDjDiscoveries() }));
vi.mock('../../hooks/useStats', () => ({ useStats: () => mockUseStats() }));
vi.mock('../../hooks/useUsers', () => ({ useUsers: () => mockUseUsers() }));
vi.mock('../../hooks/useDailyGame', () => ({
  useDailyGame: () => mockUseDailyGame(),
  useMyScore: () => mockUseMyScore(),
}));
vi.mock('../../hooks/useRecentTracksByUser', () => ({ useRecentTracksByUser: () => mockUseRecentTracksByUser() }));

const mockUseNowPlaying = vi.fn();
const mockUseLyrics = vi.fn();
const mockUseAttribution = vi.fn();
vi.mock('../../hooks/useNowPlaying', () => ({ useNowPlaying: () => mockUseNowPlaying() }));
vi.mock('../../hooks/useLyrics', async (orig) => ({
  ...(await orig<typeof import('../../hooks/useLyrics')>()),
  useLyrics: () => mockUseLyrics(),
}));
vi.mock('../../hooks/useAttribution', async (orig) => ({
  ...(await orig<typeof import('../../hooks/useAttribution')>()),
  useAttribution: () => mockUseAttribution(),
}));
const mockUseGenius = vi.fn();
vi.mock('../../hooks/useGeniusDescription', () => ({ useGeniusDescription: () => mockUseGenius() }));

const mockUseRecentlyPlayed = vi.fn();
vi.mock('../../hooks/useRecentlyPlayed', () => ({
  useRecentlyPlayed: (...args: unknown[]) => mockUseRecentlyPlayed(...args),
}));

function makeWrapper(client?: QueryClient) {
  const shared = client ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: shared }, children);
}

function makeRootData(rootItems: SonosItem[]) {
  return { sections: { items: [{ items: rootItems }] } };
}

function makeRootItem(title: string, objectId: string): SonosItem {
  return {
    title,
    type: 'CONTAINER',
    resource: { type: 'CONTAINER', id: { objectId, serviceId: 'svc', accountId: 'acc' }, defaults: undefined },
  } as unknown as SonosItem;
}

const defaultRecent = {
  artistItems: [],
  albumItems: [],
  availableUsers: [],
  currentUserId: 'testuser',
  isLoading: false,
};

const albumItem = { type: 'ITEM_ALBUM', title: 'MM..FOOD', resource: { type: 'ALBUM', id: { objectId: 'mm', serviceId: 's', accountId: 'c' } } };
const nowPlaying = {
  displayTrack: 'Gumbo',
  displayArtist: 'MF DOOM',
  albumName: 'MM..FOOD',
  albumItem,
  artistItem: { type: 'ARTIST', title: 'MF DOOM', resource: { type: 'ARTIST', id: { objectId: 'mfd', serviceId: 's', accountId: 'c' } } },
  cachedArt: null,
  artUrlRaw: null,
  dominantColor: null,
  elapsedLabel: '0:14',
  durationLabel: '0:50',
  progressPct: 28,
  durationMs: 50000,
  currentObjectId: 'cur',
  prefetchAlbum: vi.fn(),
};
const playing = { isVisible: true, trackName: 'Gumbo' } as unknown as import('../../hooks/usePlayback').PlaybackState;
const defaultProps = {
  isAuthed: true,
  onAddToQueue: vi.fn(),
  ytm: { forYou: [], newReleases: [], charts: [] },
  ytmLoading: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseLocation.mockReturnValue({ pathname: '/' });
  mockUseSearchParams.mockReturnValue([new URLSearchParams()]);
  mockServiceQuery.mockResolvedValue({ error: null, data: { items: [] } });
  mockBrowseContainer.mockResolvedValue({ error: null, data: { items: [] } });
  mockUseRecentlyPlayed.mockReturnValue(defaultRecent);
  mockUseOfficePresence.mockReturnValue({ data: { inOffice: [] } });
  mockUseDjSet.mockReturnValue({ data: undefined, isLoading: false });
  mockUseDjDiscoveries.mockReturnValue({ discoveries: [], isLoading: false });
  mockUseStats.mockReturnValue({ data: undefined });
  mockUseUsers.mockReturnValue({ data: [] });
  mockUseDailyGame.mockReturnValue({ data: undefined });
  mockUseMyScore.mockReturnValue({ data: undefined });
  mockUseRecentTracksByUser.mockReturnValue({ tracksByUser: new Map(), albumsByUser: new Map() });
  mockArtistPhoto.mockImplementation(() => null);
  mockUseNowPlaying.mockReturnValue(nowPlaying);
  mockUseGenius.mockReturnValue({ description: null, isLoading: false });
  mockUseLyrics.mockReturnValue({ lines: [], plainLyrics: null, isLoading: false, isInstrumental: false, notFound: true });
  mockUseAttribution.mockReturnValue({ cur: { user: 'Joe', timestamp: 1, trackName: 'Gumbo', artist: 'MF DOOM' } });
});

// ── fetchYtmSections ────────────────────────────────────────────────────────

describe('fetchYtmSections', () => {
  it('returns empty sections when root browse errors', async () => {
    mockBrowseContainer.mockResolvedValueOnce({ error: 'fail', data: null });
    const result = await fetchYtmSections();
    expect(result).toEqual({ forYou: [], newReleases: [], charts: [] });
  });

  it('returns empty sections when root data has no sections', async () => {
    mockBrowseContainer.mockResolvedValueOnce({ error: null, data: {} });
    const result = await fetchYtmSections();
    expect(result).toEqual({ forYou: [], newReleases: [], charts: [] });
  });

  it('browses Home, New releases, Charts when items are present', async () => {
    const homeItem    = makeRootItem('Home',         'home-id');
    const nrItem      = makeRootItem('New releases', 'nr-id');
    const chartsItem  = makeRootItem('Charts',       'charts-id');
    mockBrowseContainer
      .mockResolvedValueOnce({ error: null, data: makeRootData([homeItem, nrItem, chartsItem]) })
      .mockResolvedValue({ error: null, data: { items: [] } });

    await fetchYtmSections();

    expect(mockBrowseContainer).toHaveBeenCalledWith('home-id',   expect.anything());
    expect(mockBrowseContainer).toHaveBeenCalledWith('nr-id',     expect.anything());
    expect(mockBrowseContainer).toHaveBeenCalledWith('charts-id', expect.anything());
  });

  it('falls back to the shelves inside Home when the root has no New releases or Charts', async () => {
    const homeItem     = makeRootItem('Home',            'home-id');
    const libraryItem  = makeRootItem('Library',         'lib-id');
    const supermixItem = makeRootItem('My Supermix',     'sm-id');
    const freshShelf   = makeRootItem('Fresh new music', 'fresh-id');
    const topShelf     = makeRootItem('Top songs',       'top-id');
    const newTrack: SonosItem = { name: 'New Track', type: 'TRACK' } as SonosItem;
    const chartTrack: SonosItem = { name: 'Chart Track', type: 'TRACK' } as SonosItem;
    mockBrowseContainer.mockImplementation(async (id: string) => {
      if (id === 'root') return { error: null, data: makeRootData([homeItem, libraryItem, supermixItem]) };
      if (id === 'home-id') return { error: null, data: { items: [freshShelf, topShelf] } };
      if (id === 'fresh-id') return { error: null, data: { items: [newTrack] } };
      if (id === 'top-id') return { error: null, data: { items: [chartTrack] } };
      return { error: null, data: { items: [] } };
    });

    const result = await fetchYtmSections();
    expect(result.newReleases.map((i) => i.name)).toEqual(['New Track']);
    expect(result.charts.map((i) => i.name)).toEqual(['Chart Track']);
  });

  it('removes podcasts and episodes from For You, New releases and Charts but keeps tracks and albums', async () => {
    const homeItem     = makeRootItem('Home',            'home-id');
    const supermixItem = makeRootItem('My Supermix',     'sm-id');
    const nrItem       = makeRootItem('New releases',    'nr-id');
    const chartsItem   = makeRootItem('Charts',          'charts-id');
    const podShelf     = makeRootItem('Top podcasts',    'pod-id');
    const mk = (name: string, type: string) => ({ name, type }) as SonosItem;
    mockBrowseContainer.mockImplementation(async (id: string) => {
      if (id === 'root') return { error: null, data: makeRootData([homeItem, supermixItem, nrItem, chartsItem]) };
      if (id === 'home-id') {
        return { error: null, data: { items: [
          mk('Home Track', 'TRACK'), mk('Home Pod', 'PODCAST'), mk('Home Ep', 'EPISODE'), podShelf,
          { name: 'Wrapped', type: 'x', resource: { type: 'PODCAST_EPISODE' } } as unknown as SonosItem,
        ] } };
      }
      if (id === 'nr-id') return { error: null, data: { items: [mk('New Album', 'ALBUM'), mk('New Pod', 'PODCAST')] } };
      if (id === 'charts-id') return { error: null, data: { items: [mk('Chart Track', 'TRACK'), mk('Chart Ep', 'EPISODE'), mk('Mix', 'PROGRAM')] } };
      return { error: null, data: { items: [] } };
    });

    const result = await fetchYtmSections();
    expect(result.forYou.map((i) => i.name ?? i.title)).toEqual(['My Supermix', 'Home Track']);
    expect(result.newReleases.map((i) => i.name)).toEqual(['New Album']);
    expect(result.charts.map((i) => i.name)).toEqual(['Chart Track', 'Mix']);
  });

  it('drops a shelf whose children are all podcasts, by type, and keeps a mixed shelf and the supermix art', async () => {
    const homeItem = makeRootItem('Home', 'home-id');
    const supermix = makeRootItem('My Supermix', 'sm-id');
    const shows = makeRootItem('Popular shows', 'shows-id');
    const mixed = makeRootItem('Mixed for you', 'mixed-id');
    const art = (u: string) => ({ images: { tile1x1: u } });
    mockBrowseContainer.mockImplementation(async (id: string) => {
      if (id === 'root') return { error: null, data: makeRootData([homeItem, supermix]) };
      if (id === 'home-id') return { error: null, data: { items: [shows, mixed] } };
      if (id === 'shows-id') return { error: null, data: { items: [{ type: 'PODCAST', resource: { type: 'PODCAST' } }, { type: 'EPISODE', resource: { type: 'PODCAST_EPISODE' } }] } };
      if (id === 'mixed-id') return { error: null, data: { items: [{ type: 'PODCAST', resource: { type: 'PODCAST' } }, { type: 'TRACK', name: 'A Song' }] } };
      if (id === 'sm-id') return { error: null, data: { items: [{ type: 'TRACK', name: 'First', ...art('https://img.example/first.jpg') }] } };
      return { error: null, data: { items: [] } };
    });
    const result = await fetchYtmSections();
    expect(result.forYou.map((i) => i.title ?? i.name), 'Expected the all-podcast shelf dropped').toEqual(['My Supermix', 'Mixed for you']);
    expect(result.forYou[0].imageUrl, 'Expected the first child art, not the app icon').toBe('https://img.example/first.jpg');
  });

  it('drops a Home shelf titled as podcasts so it is never browsed as a fallback source', async () => {
    const homeItem  = makeRootItem('Home',         'home-id');
    const podShelf  = makeRootItem('New podcasts', 'pod-id');
    mockBrowseContainer.mockImplementation(async (id: string) => {
      if (id === 'root') return { error: null, data: makeRootData([homeItem]) };
      if (id === 'home-id') return { error: null, data: { items: [podShelf] } };
      return { error: null, data: { items: [] } };
    });
    const result = await fetchYtmSections();
    expect(result.forYou).toEqual([]);
  });

  it('returns browse items in the correct section', async () => {
    const homeItem = makeRootItem('Home', 'home-id');
    const track: SonosItem = { name: 'Track A', type: 'TRACK' } as SonosItem;
    mockBrowseContainer
      .mockResolvedValueOnce({ error: null, data: makeRootData([homeItem]) })
      .mockResolvedValueOnce({ error: null, data: { items: [track] } });

    const result = await fetchYtmSections();
    expect(result.forYou).toHaveLength(1);
    expect(result.forYou[0].name).toBe('Track A');
  });

  it('prepends supermix item to forYou when present', async () => {
    const supermixItem = makeRootItem('My Supermix', 'sm-id');
    const homeItem     = makeRootItem('Home',         'home-id');
    const track: SonosItem = { name: 'Home Track', type: 'TRACK' } as SonosItem;
    mockBrowseContainer
      .mockResolvedValueOnce({ error: null, data: makeRootData([supermixItem, homeItem]) })
      .mockResolvedValueOnce({ error: null, data: { items: [track] } });

    const result = await fetchYtmSections();
    expect(result.forYou[0].title).toBe('My Supermix');
    expect(result.forYou[1].name).toBe('Home Track');
  });

  it('returns empty array for a section when browse item has no objectId', async () => {
    const badItem = { title: 'Home', type: 'CONTAINER', resource: { id: {} } } as unknown as SonosItem;
    mockBrowseContainer.mockResolvedValueOnce({ error: null, data: makeRootData([badItem]) });

    const result = await fetchYtmSections();
    expect(result.forYou).toEqual([]);
  });

  it('returns empty array for a section when its browse call errors', async () => {
    const homeItem = makeRootItem('Home', 'home-id');
    mockBrowseContainer
      .mockResolvedValueOnce({ error: null, data: makeRootData([homeItem]) })
      .mockResolvedValueOnce({ error: 'fail', data: null });

    const result = await fetchYtmSections();
    expect(result.forYou).toEqual([]);
  });
});

// ── HomePanel component ─────────────────────────────────────────────────────

function discovery(n: number) {
  return {
    track: {
      id: { objectId: `uri:${n}`, serviceId: 's', accountId: 'c' },
      title: `Song ${n}`,
      artUrl: null,
      albumId: `alb${n}`,
      albumName: `Album ${n}`,
      raw: { type: 'TRACK', title: `Song ${n}` },
    },
    artist: `Artist ${n}`,
    because: `Because ${n}`,
    score: 1,
  };
}

const statsTrack = (n: number, extra: Partial<StatsTrack> = {}): StatsTrack => ({
  trackName: `Hit ${n}`, artist: `Band ${n}`, uri: `u:${n}`, serviceId: '9', accountId: 'a', artistId: `ar${n}`, count: 20 - n, ...extra,
});

describe('HomePanel', () => {
  it('shows waiting message when not authed', () => {
    render(<HomePanel {...defaultProps} isAuthed={false} />, { wrapper: makeWrapper() });
    expect(screen.getByText('Waiting for authentication…')).toBeInTheDocument();
  });

  it('shows For You with the collection name over its tile', () => {
    const ytm = { forYou: [{ name: 'Song A', type: 'TRACK' } as SonosItem], newReleases: [], charts: [] };
    render(<HomePanel {...defaultProps} ytm={ytm} />, { wrapper: makeWrapper() });
    expect(screen.getByText('For you')).toBeInTheDocument();
    expect(screen.getByText('Song A')).toBeInTheDocument();
  });

  it('gives For you mixes, stations and shelves no +, only a way in; a single song keeps its +', () => {
    const onAddToQueue = vi.fn();
    // The live shapes: the supermix is a PLAYLIST resource, a station a PROGRAM, a shelf a CONTAINER.
    const supermix = { title: 'My Supermix', type: 'ITEM_PLAYLIST', resource: { type: 'PLAYLIST', id: { objectId: 'mix' } } } as SonosItem;
    const station = { title: 'Jamie Woon Radio', type: 'ITEM_STATION', resource: { type: 'PROGRAM', id: { objectId: 'st' } } } as SonosItem;
    const shelf = { title: 'Quick picks', type: 'ITEM_AUDIO', resource: { type: 'CONTAINER', id: { objectId: 'qp' } } } as SonosItem;
    const ytm = { forYou: [supermix, station, shelf, { name: 'Song A', type: 'TRACK' } as SonosItem], newReleases: [], charts: [] };
    render(<HomePanel {...defaultProps} onAddToQueue={onAddToQueue} ytm={ytm} />, { wrapper: makeWrapper() });
    for (const name of ['My Supermix', 'Jamie Woon Radio', 'Quick picks']) {
      expect(screen.queryByRole('button', { name: `Add ${name} to queue` }), name).toBeNull();
      expect(screen.getByRole('button', { name }), name).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Add Song A to queue' })).toBeInTheDocument();
    expect(onAddToQueue).not.toHaveBeenCalled();
  });

  it('keeps the For You title but no tiles while ytmLoading', () => {
    const ytm = { forYou: [{ name: 'Song A', type: 'TRACK' } as SonosItem], newReleases: [], charts: [] };
    render(<HomePanel {...defaultProps} ytm={ytm} ytmLoading />, { wrapper: makeWrapper() });
    expect(screen.getByText('For you')).toBeInTheDocument();
    expect(screen.queryByText('Song A')).not.toBeInTheDocument();
  });

  it('drops New Releases, Charts, Playlists, People and Recently Played', () => {
    mockUseRecentlyPlayed.mockReturnValue({ ...defaultRecent, artistItems: [{ type: 'ARTIST', title: 'The Beatles' } as SonosItem] });
    render(<HomePanel {...defaultProps} />, { wrapper: makeWrapper() });
    for (const gone of ['New Releases', 'Charts', 'Playlists', 'People', /Recently Played/]) {
      expect(screen.queryByText(gone)).not.toBeInTheDocument();
    }
  });

  it('hides every data section when there is no data', () => {
    render(<HomePanel {...defaultProps} />, { wrapper: makeWrapper() });
    for (const t of [/Picks for/, /Trending in the office/, 'Jump back in', 'What people are queuing', /Queuedle today/]) {
      expect(screen.queryByText(t)).not.toBeInTheDocument();
    }
  });

  it('greets the user by first name', () => {
    render(<HomePanel {...defaultProps} displayName="Joe Pitts" />, { wrapper: makeWrapper() });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^Good (morning|afternoon|evening), Joe$/);
  });

  describe('picks', () => {
    beforeEach(() => {
      mockUseOfficePresence.mockReturnValue({ data: { inOffice: ['Rich', 'Abbie'] } });
      mockUseDjSet.mockReturnValue({ data: { artists: [], tracks: [] }, isLoading: false });
      mockUseDjDiscoveries.mockReturnValue({ discoveries: Array.from({ length: 10 }, (_, i) => discovery(i + 1)), isLoading: false });
    });

    it('shows up to 8 picks with reasons and the people in the office', () => {
      render(<HomePanel {...defaultProps} />, { wrapper: makeWrapper() });
      expect(screen.getByText("Picks for who's in")).toBeInTheDocument();
      expect(screen.getByText('Song 8')).toBeInTheDocument();
      expect(screen.queryByText('Song 9')).not.toBeInTheDocument();
      expect(screen.getByText('Because 1')).toBeInTheDocument();
      expect(screen.getByText('Rich')).toBeInTheDocument();
    });

    it('queues one pick with a labelled + button', () => {
      const add = vi.fn();
      render(<HomePanel {...defaultProps} onAddToQueue={add} />, { wrapper: makeWrapper() });
      fireEvent.click(screen.getByRole('button', { name: 'Add Song 1 to queue' }));
      expect(add).toHaveBeenCalledWith(expect.objectContaining({ title: 'Song 1' }), -1, { attribute: false });
    });

    it('Queue all queues each pick without attribution', () => {
      const add = vi.fn();
      render(<HomePanel {...defaultProps} onAddToQueue={add} />, { wrapper: makeWrapper() });
      fireEvent.click(screen.getByRole('button', { name: /Queue all/ }));
      expect(add).toHaveBeenCalledTimes(8);
      expect(add).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Song 8' }), -1, { attribute: false });
    });

    it('shortens the reason on the featured card', () => {
      mockUseDjDiscoveries.mockReturnValue({
        discoveries: [{ ...discovery(1), because: 'Rich and Alex queue Gorillaz — never played here' }],
        isLoading: false,
      });
      render(<HomePanel {...defaultProps} />, { wrapper: makeWrapper() });
      expect(screen.getByText('Rich & Alex love Gorillaz')).toBeInTheDocument();
    });

    it('makes the first pick whose artist has a photo the hero', async () => {
      const act = (n: number) => ({ artist: `Artist ${n}`, artistId: `a${n}`, serviceId: 's', accountId: 'c' });
      mockUseDjSet.mockReturnValue({ data: { artists: [act(1), act(2)], tracks: [] }, isLoading: false });
      mockArtistPhoto.mockImplementation((id) => (id === 'a2' ? 'https://img.example/p2.jpg' : null));  // settles before the hero is chosen
      render(<HomePanel {...defaultProps} />, { wrapper: makeWrapper() });
      await waitFor(() =>
        expect(screen.getAllByRole('button', { name: /^Add Song/ })[0]).toHaveAccessibleName('Add Song 2 to queue'),
      );
    });

    it('clicking a pick card opens its album, and the artist name opens the artist, without queuing', async () => {
      const add = vi.fn();
      mockUseDjSet.mockReturnValue({
        data: { artists: [{ artist: 'Artist 1', artistId: 'a1', serviceId: 's', accountId: 'c' }], tracks: [] },
        isLoading: false,
      });
      render(<HomePanel {...defaultProps} onAddToQueue={add} />, { wrapper: makeWrapper() });

      fireEvent.click(await screen.findByRole('button', { name: 'Open album Album 1' }));
      expect(mockOpenItem).toHaveBeenCalledWith(
        expect.objectContaining({ resource: expect.objectContaining({ id: { objectId: 'alb1', serviceId: 's', accountId: 'c' } }) }),
      );
      expect(add).not.toHaveBeenCalled();

      mockOpenItem.mockClear();
      fireEvent.click(screen.getByRole('button', { name: 'Artist 1, open artist' }));
      expect(mockOpenItem).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'ARTIST', resource: expect.objectContaining({ id: expect.objectContaining({ objectId: 'a1' }) }) }),
      );
      expect(add).not.toHaveBeenCalled();
    });

    it('says You when the viewer is the subject, and never their own name', () => {
      mockUseDjDiscoveries.mockReturnValue({
        discoveries: [{ ...discovery(1), because: 'Joe Pitts queues Gorillaz — never played here' }],
        isLoading: false,
      });
      render(<HomePanel {...defaultProps} displayName="Joe Pitts" />, { wrapper: makeWrapper() });
      expect(screen.getByText('You love Gorillaz')).toBeInTheDocument();
      expect(screen.queryByText(/Joe Pitts love/)).not.toBeInTheDocument();
    });

    it('titles the section "Picks for you" and drops the face row when only the viewer is in', () => {
      mockUseOfficePresence.mockReturnValue({ data: { inOffice: ['Joe Pitts'] } });
      render(<HomePanel {...defaultProps} displayName="Joe Pitts" />, { wrapper: makeWrapper() });
      expect(screen.getByText('Picks for you')).toBeInTheDocument();
      expect(screen.queryByLabelText('In the office')).not.toBeInTheDocument();
    });

    it('shows the reason on art cards only; compact rows get just the Never played here tag', () => {
      mockUseDjDiscoveries.mockReturnValue({
        discoveries: Array.from({ length: 6 }, (_, i) => ({ ...discovery(i + 1), because: `Rich queues Artist ${i + 1} — never played here` })),
        isLoading: false,
      });
      render(<HomePanel {...defaultProps} />, { wrapper: makeWrapper() });
      // pick 4 is a compact row: its reason line is the tag, not the sentence, and has no em dash
      expect(screen.getAllByText('Never played here').length).toBeGreaterThan(0);
      expect(screen.queryByText(/ — never played here/i)).not.toBeInTheDocument();
    });

    it('title and artist buttons are named with their visible text first (label in name)', () => {
      render(<HomePanel {...defaultProps} />, { wrapper: makeWrapper() });
      expect(screen.getByRole('button', { name: /^Song 4/ })).toHaveTextContent('Song 4');
      expect(screen.getByRole('button', { name: 'Song 4, open album' })).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Artist 4, open artist' }).length).toBeGreaterThan(0);
    });

    it('keeps the same hero when an artist photo arrives later', async () => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const act_ = (n: number) => ({ artist: `Artist ${n}`, artistId: `a${n}`, serviceId: 's', accountId: 'c' });
      mockUseDjSet.mockReturnValue({ data: { artists: [act_(1), act_(2), act_(3)], tracks: [] }, isLoading: false });
      render(<HomePanel {...defaultProps} />, { wrapper: makeWrapper(client) });
      await waitFor(() => expect(screen.getAllByRole('button', { name: /^Add Song/ })[0]).toHaveAccessibleName('Add Song 1 to queue'));
      // A photo for the second artist shows up afterwards: nothing may be reordered.
      act(() => { client.setQueryData(['artist-image', 'a2'], 'https://img.example/p2.jpg'); });
      expect(screen.getAllByRole('button', { name: /^Add Song/ })[0]).toHaveAccessibleName('Add Song 1 to queue');
    });

    it('clicking + queues the pick and does not navigate', () => {
      const add = vi.fn();
      render(<HomePanel {...defaultProps} onAddToQueue={add} />, { wrapper: makeWrapper() });
      fireEvent.click(screen.getByRole('button', { name: 'Add Song 1 to queue' }));
      expect(add).toHaveBeenCalledTimes(1);
      expect(mockOpenItem).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('Queue all shows an Undo toast, and Undo removes exactly the queued tracks', () => {
      const add = vi.fn();
      const row = (n: number, id = `uri:${n}`) => ({ index: n, track: { id, title: `Song ${n}`, artist: `Artist ${n}` } });
      // somebody else's tracks sit around ours
      const queue = [row(100, 'other-1'), row(1), row(101, 'other-2'), ...[2, 3, 4, 5, 6, 7, 8].map((n) => row(n))] as never[];
      render(<HomePanel {...defaultProps} onAddToQueue={add} queueItems={queue} />, { wrapper: makeWrapper() });
      fireEvent.click(screen.getByRole('button', { name: /Queue all/ }));
      expect(add).toHaveBeenCalledTimes(8);
      expect(mockShowToast).toHaveBeenCalledWith('Queued 8 picks', 'info', expect.objectContaining({ durationMs: 6000, action: expect.objectContaining({ label: 'Undo' }) }));
      const { action } = mockShowToast.mock.calls[0][2];
      action.onClick();
      // positions 1 and 3..9: our eight tracks; positions 0 and 2 (others) untouched
      expect(mockRemoveFromQueue).toHaveBeenCalledWith([1, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('Undo leaves alone anything that is no longer ours in the queue', () => {
      const row = (n: number) => ({ index: n, track: { id: `uri:${n}`, title: `Song ${n}`, artist: `Artist ${n}` } });
      render(<HomePanel {...defaultProps} queueItems={[row(1), row(2)] as never[]} />, { wrapper: makeWrapper() });
      fireEvent.click(screen.getByRole('button', { name: /Queue all/ }));
      mockShowToast.mock.calls[0][2].action.onClick();
      expect(mockRemoveFromQueue).toHaveBeenCalledWith([0, 1]);
    });

    it('labels the section for the whole office when nobody is in', () => {
      mockUseOfficePresence.mockReturnValue({ data: { inOffice: [] } });
      render(<HomePanel {...defaultProps} />, { wrapper: makeWrapper() });
      expect(screen.getByText('Picks for the whole office')).toBeInTheDocument();
    });
  });

  describe('trending', () => {
    it('lists the top 10 with rank and count, hides + when the track has no uri, and opens the artist', () => {
      const tracks = Array.from({ length: 12 }, (_, i) => statsTrack(i + 1));
      tracks[1] = statsTrack(2, { uri: undefined });
      mockUseStats.mockReturnValue({ data: { topTracks: tracks } });
      const add = vi.fn();
      render(<HomePanel {...defaultProps} onAddToQueue={add} />, { wrapper: makeWrapper() });

      expect(screen.getByText(/Trending in the office/)).toBeInTheDocument();
      expect(screen.getByText('Hit 10')).toBeInTheDocument();
      expect(screen.queryByText('Hit 11')).not.toBeInTheDocument();
      expect(screen.getByText('19')).toBeInTheDocument();
      expect(screen.getByText('01')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Add Hit 2 to queue' })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Add Hit 1 to queue' }));
      expect(add).toHaveBeenCalledWith(expect.objectContaining({ title: 'Hit 1' }));

      fireEvent.click(screen.getByRole('button', { name: 'Band 1, open artist' }));
      expect(mockOpenItem).toHaveBeenCalledWith(expect.objectContaining({ type: 'ARTIST', name: 'Band 1' }));
    });
  });

  describe('trending navigation', () => {
    it('a chart row title opens the track album', () => {
      mockUseStats.mockReturnValue({
        data: { topTracks: [statsTrack(1, { album: 'Album One', albumId: 'al1' })] },
      });
      render(<HomePanel {...defaultProps} />, { wrapper: makeWrapper() });
      fireEvent.click(screen.getByRole('button', { name: 'Hit 1, open album' }));
      expect(mockOpenItem).toHaveBeenCalledWith(
        expect.objectContaining({ resource: expect.objectContaining({ id: { objectId: 'al1', serviceId: '9', accountId: 'a' } }) }),
      );
    });

    it('a chart row without an album id searches for the album by name', async () => {
      mockUseStats.mockReturnValue({ data: { topTracks: [statsTrack(1, { album: 'Album One' })] } });
      render(<HomePanel {...defaultProps} />, { wrapper: makeWrapper() });
      fireEvent.click(screen.getByRole('button', { name: 'Hit 1, open album' }));
      await waitFor(() => expect(mockServiceQuery).toHaveBeenCalledWith('Album One Band 1', expect.anything()));
      expect(mockOpenItem).not.toHaveBeenCalled();
    });
  });

  describe('trending cap', () => {
    it('shows at most two tracks per artist', () => {
      mockUseStats.mockReturnValue({ data: { topTracks: [1, 2, 3].map((n) => statsTrack(n, { artist: 'Beast In Black' })) } });
      render(<HomePanel {...defaultProps} />, { wrapper: makeWrapper() });
      expect(screen.getByText('Hit 2')).toBeInTheDocument();
      expect(screen.queryByText('Hit 3')).not.toBeInTheDocument();
    });

    it('links See all to the leaderboard', () => {
      mockUseStats.mockReturnValue({ data: { topTracks: [statsTrack(1)] } });
      render(<HomePanel {...defaultProps} />, { wrapper: makeWrapper() });
      fireEvent.click(screen.getByRole('button', { name: 'See all' }));
      expect(mockNavigate).toHaveBeenCalledWith('/leaderboard');
    });
  });

  describe('what people are queuing', () => {
    const album = { album: 'Hybrid Theory', artist: 'Linkin Park', albumId: 'ht', serviceId: 's', accountId: 'c', lastPlayed: Date.now() };

    beforeEach(() => {
      mockUseOfficePresence.mockReturnValue({ data: { inOffice: ['Rich', 'Abbie', 'Alex'] } });
    });

    it('shows each person\'s recent albums, opens an album tile and the profile', () => {
      mockUseRecentTracksByUser.mockReturnValue({
        tracksByUser: new Map(),
        albumsByUser: new Map([
          ['Rich', [album, { ...album, album: 'Meteora', albumId: 'met', lastPlayed: 1 }]],
          ['Abbie', []],
        ]),
      });
      const add = vi.fn();
      render(<HomePanel {...defaultProps} onAddToQueue={add} />, { wrapper: makeWrapper() });

      expect(screen.getByText('What people are queuing')).toBeInTheDocument();
      expect(screen.getByText('2 albums this week')).toBeInTheDocument();
      expect(screen.getByText('Today')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Abbie/ })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /^Hybrid Theory/ }));
      expect(mockOpenItem).toHaveBeenCalledWith(
        expect.objectContaining({ id: { objectId: 'ht', serviceId: 's', accountId: 'c' } }),
      );
      expect(add).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Add Hybrid Theory to queue' }));
      expect(add).toHaveBeenCalledWith(expect.objectContaining({ title: 'Hybrid Theory' }));

      fireEvent.click(screen.getByRole('button', { name: /^Rich/ }));
      expect(mockNavigate).toHaveBeenCalledWith('/profile/Rich');
    });

    it('falls back to latest tracks as tiles when someone has no albums', () => {
      mockUseRecentTracksByUser.mockReturnValue({
        tracksByUser: new Map([
          ['Abbie', [{ trackName: 'Numb', artist: 'Linkin Park', uri: 'u:n', albumId: 'ht', serviceId: 's', accountId: 'c', lastPlayed: 5 }]],
        ]),
        albumsByUser: new Map(),
      });
      const add = vi.fn();
      render(<HomePanel {...defaultProps} onAddToQueue={add} />, { wrapper: makeWrapper() });

      expect(screen.getByText('1 track this week')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /^Numb/ }));
      expect(mockOpenItem).toHaveBeenCalledWith(
        expect.objectContaining({ resource: expect.objectContaining({ id: { objectId: 'ht', serviceId: 's', accountId: 'c' } }) }),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Add Numb to queue' }));
      expect(add).toHaveBeenCalledWith(expect.objectContaining({ title: 'Numb' }));
    });
  });

  describe('queuedle', () => {
    it('offers Play when not played yet', () => {
      mockUseDailyGame.mockReturnValue({ data: { id: 'g1', questions: [1, 2, 3] } });
      render(<HomePanel {...defaultProps} />, { wrapper: makeWrapper() });
      expect(screen.getByText('Not played yet')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Play' }));
      expect(mockNavigate).toHaveBeenCalledWith('/queuedle');
    });

    it('shows the score out of the max once played', () => {
      mockUseDailyGame.mockReturnValue({ data: { id: 'g1', questions: [1, 2, 3] } });
      // get-my-score sends main + bonus only (no total), so the tile must add them
      mockUseMyScore.mockReturnValue({ data: { score: { mainScore: 3, bonusScore: 1 } } });
      render(<HomePanel {...defaultProps} />, { wrapper: makeWrapper() });
      expect(screen.getByText('Your score 4 / 6')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'View results' })).toBeInTheDocument();
    });
  });

  describe('jump back in', () => {
    const knownArtist = {
      type: 'ARTIST', title: 'Sub Focus', name: 'Sub Focus',
      resource: { type: 'ARTIST', id: { objectId: 'sf', serviceId: 'svc', accountId: 'acc' } },
    } as unknown as SonosItem;
    const idlessArtist = {
      type: 'ARTIST', title: 'Inéz', name: 'Inéz',
      resource: { type: 'ARTIST', id: { objectId: undefined, serviceId: 'svc', accountId: 'acc' } },
    } as unknown as SonosItem;
    const album = { type: 'ITEM_ALBUM', title: 'Hybrid Theory', name: 'Hybrid Theory', id: { objectId: 'ht', serviceId: 's', accountId: 'c' } } as SonosItem;

    it('shows albums and artists, deduping artists by primary name', () => {
      const dup = { ...knownArtist, title: 'sub focus & Friends', name: 'sub focus & Friends' } as SonosItem;
      mockUseRecentlyPlayed.mockReturnValue({ ...defaultRecent, artistItems: [knownArtist, dup], albumItems: [album] });
      render(<HomePanel {...defaultProps} />, { wrapper: makeWrapper() });
      expect(screen.getByText('Jump back in')).toBeInTheDocument();
      expect(screen.getByText('Hybrid Theory')).toBeInTheDocument();
      expect(screen.getAllByText('Sub Focus')).toHaveLength(1);
    });

    it('opens an artist with an id directly and an album via openItem', () => {
      mockUseRecentlyPlayed.mockReturnValue({ ...defaultRecent, artistItems: [knownArtist], albumItems: [album] });
      render(<HomePanel {...defaultProps} />, { wrapper: makeWrapper() });
      fireEvent.click(screen.getByText('Sub Focus'));
      expect(mockOpenItem).toHaveBeenCalledWith(knownArtist);
      fireEvent.click(screen.getByText('Hybrid Theory'));
      expect(mockOpenItem).toHaveBeenCalledWith(album);
    });

    it('never opens an id-less artist (which would go to /artist/_); resolves it by name first', async () => {
      mockServiceQuery.mockResolvedValue({
        error: null,
        data: {
          resourceOrder: ['ARTISTS'],
          ARTISTS: { resources: [{ name: 'Inéz', id: { objectId: 'inez-id', serviceId: 'svc', accountId: 'acc' }, images: [] }] },
        },
      });
      mockUseRecentlyPlayed.mockReturnValue({ ...defaultRecent, artistItems: [idlessArtist] });
      render(<HomePanel {...defaultProps} />, { wrapper: makeWrapper() });
      fireEvent.click(screen.getByText('Inéz'));
      await waitFor(() => expect(mockOpenItem).toHaveBeenCalledTimes(1));
      expect(mockOpenItem).not.toHaveBeenCalledWith(idlessArtist);
      expect(mockOpenItem.mock.calls[0][0].resource.id.objectId).toBe('inez-id');
    });

    it('does not navigate when an id-less artist cannot be resolved', async () => {
      mockServiceQuery.mockResolvedValue({ error: null, data: { resourceOrder: ['ARTISTS'], ARTISTS: { resources: [] } } });
      mockUseRecentlyPlayed.mockReturnValue({ ...defaultRecent, artistItems: [idlessArtist] });
      render(<HomePanel {...defaultProps} />, { wrapper: makeWrapper() });
      fireEvent.click(screen.getByText('Inéz'));
      await waitFor(() => expect(mockServiceQuery).toHaveBeenCalled());
      expect(mockOpenItem).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('now playing band', () => {
    it('is hidden when nothing is playing', () => {
      render(<HomePanel {...defaultProps} playback={{ isVisible: false, trackName: '' } as never} />, { wrapper: makeWrapper() });
      expect(screen.queryByRole('region', { name: 'Now playing' })).not.toBeInTheDocument();
      render(<HomePanel {...defaultProps} />, { wrapper: makeWrapper() });
      expect(screen.queryByRole('region', { name: 'Now playing' })).not.toBeInTheDocument();
    });

    it('shows the track, who queued it and progress, with no Up next', () => {
      render(<HomePanel {...defaultProps} playback={playing} />, { wrapper: makeWrapper() });
      expect(screen.getByRole('region', { name: 'Now playing' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Gumbo' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Queued by Joe, open profile' })).toHaveTextContent('Queued by Joe');
      expect(screen.getByRole('progressbar', { name: 'Track progress' })).toHaveAttribute('aria-valuenow', '28');
      expect(screen.getByText('0:14')).toBeInTheDocument();
      expect(screen.queryByText(/up next/i)).not.toBeInTheDocument();
    });

    it('shows the first paragraph of the Genius description, with no link', () => {
      mockUseGenius.mockReturnValue({
        description: { tag: 'root', children: [{ tag: 'p', children: ['Gumbo is a ', { tag: 'em', children: ['food'] }, ' song.'] }, { tag: 'p', children: ['Second.'] }] },
        isLoading: false,
      });
      render(<HomePanel {...defaultProps} playback={playing} />, { wrapper: makeWrapper() });
      expect(screen.getByText('Gumbo is a food song.')).toBeInTheDocument();
      expect(screen.queryByText('Second.')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /genius/i })).not.toBeInTheDocument();
    });

    it('hides the description block when there is none', () => {
      render(<HomePanel {...defaultProps} playback={playing} />, { wrapper: makeWrapper() });
      expect(screen.queryByLabelText('About this track')).not.toBeInTheDocument();
    });

    it('opens the album from the art, the artist from the name and the profile from the queuer', () => {
      render(<HomePanel {...defaultProps} playback={playing} />, { wrapper: makeWrapper() });
      const band = within(screen.getByRole('region', { name: 'Now playing' }));
      fireEvent.click(band.getByRole('button', { name: 'Open album MM..FOOD' }));
      expect(mockOpenItem).toHaveBeenCalledWith(albumItem);
      fireEvent.click(band.getByRole('button', { name: 'MF DOOM, open artist' }));
      expect(mockOpenItem).toHaveBeenCalledWith(expect.objectContaining({ type: 'ARTIST' }));
      fireEvent.click(band.getByRole('button', { name: 'Queued by Joe, open profile' }));
      expect(mockNavigate).toHaveBeenCalledWith('/profile/Joe');
    });

    it('keeps the lyrics box with skeleton lines while lyrics load, without hiding the band layout', () => {
      mockUseLyrics.mockReturnValue({ lines: [], plainLyrics: null, isLoading: true, isInstrumental: false, notFound: false });
      const { container } = render(<HomePanel {...defaultProps} playback={playing} />, { wrapper: makeWrapper() });
      expect(screen.getByLabelText('Lyrics, open full lyrics')).toHaveAttribute('aria-busy', 'true');
      expect(container.querySelectorAll('[class*=lyricSkel]')).toHaveLength(5);
      expect(container.querySelector('[class*=bandSolo]')).toBeNull();
    });

    it('shows skeleton lines for the description while it loads, and hides it once settled empty', () => {
      mockUseGenius.mockReturnValue({ description: null, isLoading: true });
      const { container, rerender } = render(<HomePanel {...defaultProps} playback={playing} />, { wrapper: makeWrapper() });
      expect(screen.getByLabelText('About this track')).toHaveAttribute('aria-busy', 'true');
      expect(container.querySelectorAll('[class*=aboutSkel]')).toHaveLength(3);
      mockUseGenius.mockReturnValue({ description: null, isLoading: false });
      rerender(<HomePanel {...defaultProps} playback={playing} />);
      expect(screen.queryByLabelText('About this track')).not.toBeInTheDocument();
    });

    it('hides the lyrics box once settled with no lyrics (including an error)', () => {
      render(<HomePanel {...defaultProps} playback={playing} />, { wrapper: makeWrapper() });
      expect(screen.queryByLabelText('Lyrics, open full lyrics')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Gumbo' })).toBeInTheDocument();
    });

    it('shows synced lines with the active one marked, and opens the lyrics page', () => {
      mockUseLyrics.mockReturnValue({
        lines: [{ timeMs: 1000, text: 'first line' }, { timeMs: 9000, text: 'second line' }],
        plainLyrics: null, isLoading: false, isInstrumental: false, notFound: false,
      });
      // 28% of 50s = 14s, so the second line (9s) is active
      render(<HomePanel {...defaultProps} playback={playing} />, { wrapper: makeWrapper() });
      expect(screen.getByText('first line')).toBeInTheDocument();
      expect(screen.getByText('second line').className).toMatch(/lyricActive/);
      expect(screen.getByText('first line').className).not.toMatch(/lyricActive/);
      fireEvent.click(screen.getByRole('button', { name: 'Lyrics, open full lyrics' }));
      expect(mockNavigate).toHaveBeenCalledWith('/lyrics');
    });

    it('shows a static excerpt when only plain lyrics exist', () => {
      mockUseLyrics.mockReturnValue({
        lines: [], plainLyrics: 'l1\nl2\nl3\nl4\nl5\nl6\nl7', isLoading: false, isInstrumental: false, notFound: false,
      });
      render(<HomePanel {...defaultProps} playback={playing} />, { wrapper: makeWrapper() });
      expect(screen.getByText('l5')).toBeInTheDocument();
      expect(screen.queryByText('l6')).not.toBeInTheDocument();
    });
  });

  describe('lyrics line animation', () => {
    const rule = (name: string) => (homeCss.match(new RegExp(`\\.${name}\\s*\\{[^}]*\\}`)) ?? [''])[0];

    it('animates the active line with transform and opacity from a fixed line box, never font-size', () => {
      expect(rule('lyricActive'), 'Expected the active-line rule to exist').not.toBe('');
      expect(rule('lyricActive'), 'Expected no font-size on the active line (it reflows)').not.toMatch(/font-size/);
      expect(rule('lyricActive'), 'Expected a scale transform').toMatch(/scale\(/);
      expect(rule('lyricLine'), 'Expected the line to transition transform and opacity only').toMatch(/transition:\s*transform[^;]*opacity/);
      expect(rule('lyricLine'), 'Expected no font-size in the transition').not.toMatch(/transition:[^;]*font-size/);
    });

    it('drives the progress bar with scaleX, not width', () => {
      expect(rule('nowFill'), 'Expected a transform transition').toMatch(/transition:\s*transform/);
      expect(rule('nowFill'), 'Expected no width transition').not.toMatch(/transition:[^;]*width/);
    });
  });
});
