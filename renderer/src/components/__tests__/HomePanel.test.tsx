import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { HomePanel } from '../HomePanel';

const mockServiceQuery = vi.fn();

const mockUseLocation = vi.fn();
const mockUseSearchParams = vi.fn();
vi.mock('react-router-dom', () => ({
  useLocation: () => mockUseLocation(),
  useSearchParams: () => mockUseSearchParams(),
}));

vi.mock('../../hooks/useOpenItem', () => ({ useOpenItem: () => vi.fn() }));
vi.mock('../../hooks/useAlbumBrowse', () => ({ albumQueryOptions: vi.fn() }));
vi.mock('../../hooks/useArtistBrowse', () => ({ artistQueryOptions: vi.fn() }));
vi.mock('../../lib/sonosApi', () => ({
  api: { search: { serviceQuery: (...args: unknown[]) => mockServiceQuery(...args) } },
}));
vi.mock('../CardRow', () => ({
  CardRow: ({ isLoading }: { isLoading: boolean }) =>
    isLoading ? <div>Loading cards</div> : <div>Card row</div>,
}));
vi.mock('../search/SearchResults', () => ({
  SearchResults: () => <div>Search results</div>,
}));

function makeWrapper() {
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }, children);
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
});

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

  it('shows SearchResults on /search path after query resolves', async () => {
    mockUseLocation.mockReturnValue({ pathname: '/search' });
    mockUseSearchParams.mockReturnValue([new URLSearchParams({ q: 'Beatles' })]);
    render(<HomePanel {...defaultProps} />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByText('Search results')).toBeInTheDocument());
  });

  it('shows "Searching…" on /search path while loading', () => {
    mockUseLocation.mockReturnValue({ pathname: '/search' });
    mockUseSearchParams.mockReturnValue([new URLSearchParams({ q: 'Beatles' })]);
    mockServiceQuery.mockReturnValue(new Promise(() => {}));
    render(<HomePanel {...defaultProps} />, { wrapper: makeWrapper() });
    expect(screen.getByText('Searching…')).toBeInTheDocument();
  });
});
