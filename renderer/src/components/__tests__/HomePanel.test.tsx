import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HomePanel, fetchYtmSections } from '../HomePanel';
import type { SonosItem } from '../../types/sonos';

const mockServiceQuery = vi.fn();
const mockBrowseContainer = vi.fn();

const mockUseLocation = vi.fn();
const mockUseSearchParams = vi.fn();
vi.mock('react-router-dom', () => ({
  useLocation: () => mockUseLocation(),
  useSearchParams: () => mockUseSearchParams(),
}));

vi.mock('../../hooks/useOpenItem', () => ({ useOpenItem: () => vi.fn() }));

const mockAlbumQueryOptions = vi.fn(() => ({ queryKey: ['album-test'], queryFn: async () => null }));
const mockArtistQueryOptions = vi.fn(() => ({ queryKey: ['artist-test'], queryFn: async () => null }));
vi.mock('../../hooks/useAlbumBrowse', () => ({ albumQueryOptions: (...a: unknown[]) => mockAlbumQueryOptions(...a) }));
vi.mock('../../hooks/useArtistBrowse', () => ({ artistQueryOptions: (...a: unknown[]) => mockArtistQueryOptions(...a) }));

vi.mock('../../lib/sonosApi', () => ({
  api: {
    browse: { container: (...args: unknown[]) => mockBrowseContainer(...args) },
    search: { serviceQuery: (...args: unknown[]) => mockServiceQuery(...args) },
  },
}));

vi.mock('../CardRow', () => ({
  CardRow: ({ isLoading, items }: { isLoading: boolean; items: SonosItem[] }) =>
    isLoading ? <div>Loading cards</div> : <div>Card row ({items.length})</div>,
}));
vi.mock('../search/SearchResults', () => ({
  SearchResults: ({ results }: { results: SonosItem[] }) => <div>Search results ({results.length})</div>,
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

const defaultProps = {
  isAuthed: true,
  onAddToQueue: vi.fn(),
  ytm: { forYou: [], newReleases: [], charts: [] },
  ytmLoading: false,
  history: [],
  histLoading: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseLocation.mockReturnValue({ pathname: '/' });
  mockUseSearchParams.mockReturnValue([new URLSearchParams()]);
  mockServiceQuery.mockResolvedValue({ error: null, data: { items: [] } });
  mockBrowseContainer.mockResolvedValue({ error: null, data: { items: [] } });
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

  it('returns browse items in the correct section', async () => {
    const homeItem = makeRootItem('Home', 'home-id');
    const track: SonosItem = { name: 'Track A', type: 'TRACK' } as SonosItem;
    mockBrowseContainer
      .mockResolvedValueOnce({ error: null, data: makeRootData([homeItem]) })
      .mockResolvedValueOnce({ error: null, data: { items: [track] } }); // home browse
    // nr and charts return empty (default mock)

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
      .mockResolvedValueOnce({ error: null, data: { items: [track] } }); // home browse

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
      .mockResolvedValueOnce({ error: 'fail', data: null }); // home browse fails

    const result = await fetchYtmSections();
    expect(result.forYou).toEqual([]);
  });
});

// ── HomePanel component ─────────────────────────────────────────────────────

describe('HomePanel', () => {
  it('shows sections when authed on home view', () => {
    render(<HomePanel {...defaultProps} />, { wrapper: makeWrapper() });
    expect(screen.getByText('For You')).toBeInTheDocument();
    expect(screen.getByText('Recently Played')).toBeInTheDocument();
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

  it('shows loading card row when histLoading is true', () => {
    render(<HomePanel {...defaultProps} histLoading />, { wrapper: makeWrapper() });
    expect(screen.getAllByText('Loading cards').length).toBeGreaterThan(0);
  });

  it('passes history items to recently played row', () => {
    const history = [{ name: 'Track 1', type: 'TRACK' } as SonosItem, { name: 'Track 2', type: 'TRACK' } as SonosItem];
    render(<HomePanel {...defaultProps} history={history} />, { wrapper: makeWrapper() });
    expect(screen.getByText('Card row (2)')).toBeInTheDocument();
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
