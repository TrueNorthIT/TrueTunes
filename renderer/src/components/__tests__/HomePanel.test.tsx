import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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
vi.mock('../../hooks/useArtistBrowse', () => ({ artistQueryOptions: () => mockArtistQueryOptions() }));

vi.mock('../../lib/sonosApi', () => ({
  api: {
    browse: { container: (...args: unknown[]) => mockBrowseContainer(...args) },
    search: { serviceQuery: (...args: unknown[]) => mockServiceQuery(...args) },
  },
}));

vi.mock('../CardRow', () => ({
  CardRow: ({ isLoading, items, title }: { isLoading: boolean; items: SonosItem[]; title?: string }) => (
    <>
      {title && <h2>{title}</h2>}
      {isLoading ? <div>Loading cards</div> : <div>Card row ({items.length})</div>}
    </>
  ),
}));
vi.mock('../search/SearchResults', () => ({
  SearchResults: ({ results }: { results: SonosItem[] }) => <div>Search results ({results.length})</div>,
}));

const mockUseRecentlyPlayed = vi.fn();
vi.mock('../../hooks/useRecentlyPlayed', () => ({
  useRecentlyPlayed: (...args: unknown[]) => mockUseRecentlyPlayed(...args),
}));

function makeWrapper() {
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }, children);
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

describe('HomePanel', () => {
  it('shows sections when authed on home view', () => {
    render(<HomePanel {...defaultProps} />, { wrapper: makeWrapper() });
    expect(screen.getByText('For You')).toBeInTheDocument();
    expect(screen.getByText('New Releases')).toBeInTheDocument();
    expect(screen.getByText('Charts')).toBeInTheDocument();
  });

  it('shows waiting message when not authed', () => {
    render(<HomePanel {...defaultProps} isAuthed={false} />, { wrapper: makeWrapper() });
    expect(screen.getByText('Waiting for authentication…')).toBeInTheDocument();
  });

  it('passes ytm items to card rows', () => {
    const item = { name: 'Song A', type: 'TRACK' } as SonosItem;
    const ytm = { forYou: [item], newReleases: [], charts: [] };
    render(<HomePanel {...defaultProps} ytm={ytm} />, { wrapper: makeWrapper() });
    expect(screen.getByText('Card row (1)')).toBeInTheDocument();
  });

  it('shows loading card rows when ytmLoading is true', () => {
    render(<HomePanel {...defaultProps} ytmLoading />, { wrapper: makeWrapper() });
    expect(screen.getAllByText('Loading cards').length).toBeGreaterThan(0);
  });

  it('shows loading skeleton when recentLoading is true', () => {
    const artist = { type: 'ARTIST', title: 'The Beatles' } as SonosItem;
    mockUseRecentlyPlayed.mockReturnValue({ ...defaultRecent, artistItems: [artist], isLoading: true });
    const { container } = render(<HomePanel {...defaultProps} />, { wrapper: makeWrapper() });
    expect(container.querySelector('.recentGrid')).toBeInTheDocument();
  });

  it('renders recently played section when data is present', () => {
    const artist = { type: 'ARTIST', title: 'The Beatles' } as SonosItem;
    mockUseRecentlyPlayed.mockReturnValue({ ...defaultRecent, artistItems: [artist] });
    render(<HomePanel {...defaultProps} />, { wrapper: makeWrapper() });
    expect(screen.getByText(/Recently Played/)).toBeInTheDocument();
    expect(screen.getByText('Artists')).toBeInTheDocument();
    expect(screen.getByText('The Beatles')).toBeInTheDocument();
  });

  it('hides recently played sections when all are empty and not loading', () => {
    render(<HomePanel {...defaultProps} />, { wrapper: makeWrapper() });
    expect(screen.queryByText('Recently Played')).not.toBeInTheDocument();
    expect(screen.queryByText('Artists')).not.toBeInTheDocument();
    expect(screen.queryByText('Albums')).not.toBeInTheDocument();
  });

  it('shows user picker when availableUsers are present', () => {
    const artist = { type: 'ARTIST', title: 'The Beatles' } as SonosItem;
    mockUseRecentlyPlayed.mockReturnValue({
      ...defaultRecent,
      artistItems: [artist],
      availableUsers: ['joe', 'jane'],
      currentUserId: 'joe',
    });
    render(<HomePanel {...defaultProps} />, { wrapper: makeWrapper() });
    expect(screen.getByRole('button', { name: /joe/i })).toBeInTheDocument();
  });

  it('shows SearchResults on /search path after query resolves', async () => {
    mockUseLocation.mockReturnValue({ pathname: '/search' });
    mockUseSearchParams.mockReturnValue([new URLSearchParams({ q: 'Beatles' })]);
    render(<HomePanel {...defaultProps} />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByText(/Search results/)).toBeInTheDocument());
  });

  it('shows "Searching…" on /search path while loading', () => {
    mockUseLocation.mockReturnValue({ pathname: '/search' });
    mockUseSearchParams.mockReturnValue([new URLSearchParams({ q: 'Beatles' })]);
    mockServiceQuery.mockReturnValue(new Promise(() => {}));
    render(<HomePanel {...defaultProps} />, { wrapper: makeWrapper() });
    expect(screen.getByText('Searching…')).toBeInTheDocument();
  });

  it('shows empty SearchResults when on /search with no query', async () => {
    mockUseLocation.mockReturnValue({ pathname: '/search' });
    mockUseSearchParams.mockReturnValue([new URLSearchParams()]);
    render(<HomePanel {...defaultProps} />, { wrapper: makeWrapper() });
    expect(screen.getByText('Search results (0)')).toBeInTheDocument();
  });
});

// ── Recently played artist tiles ────────────────────────────────────────────

describe('HomePanel artist tiles', () => {
  const idlessArtist = {
    type: 'ARTIST',
    title: 'Inéz',
    name: 'Inéz',
    resource: { type: 'ARTIST', id: { objectId: undefined, serviceId: 'svc', accountId: 'acc' } },
  } as unknown as SonosItem;
  const knownArtist = {
    type: 'ARTIST',
    title: 'Sub Focus',
    name: 'Sub Focus',
    resource: { type: 'ARTIST', id: { objectId: 'sf', serviceId: 'svc', accountId: 'acc' } },
  } as unknown as SonosItem;

  it('opens a tile that has an id directly', () => {
    mockUseRecentlyPlayed.mockReturnValue({ ...defaultRecent, artistItems: [knownArtist] });
    render(<HomePanel {...defaultProps} />, { wrapper: makeWrapper() });
    fireEvent.click(screen.getByText('Sub Focus'));
    expect(mockOpenItem).toHaveBeenCalledWith(knownArtist);
  });

  it('never opens an id-less tile (which would go to /artist/_); resolves it by name first', async () => {
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
    expect(mockServiceQuery).toHaveBeenCalledWith('Inéz', expect.objectContaining({ serviceId: 'svc', accountId: 'acc' }));
    expect(mockOpenItem).not.toHaveBeenCalledWith(idlessArtist);
    expect(mockOpenItem.mock.calls[0][0].resource.id.objectId).toBe('inez-id');
  });

  it('does not navigate anywhere when an id-less tile cannot be resolved', async () => {
    mockServiceQuery.mockResolvedValue({ error: null, data: { resourceOrder: ['ARTISTS'], ARTISTS: { resources: [] } } });
    mockUseRecentlyPlayed.mockReturnValue({ ...defaultRecent, artistItems: [idlessArtist] });
    render(<HomePanel {...defaultProps} />, { wrapper: makeWrapper() });

    fireEvent.click(screen.getByText('Inéz'));

    await waitFor(() => expect(mockServiceQuery).toHaveBeenCalled());
    expect(mockOpenItem).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
