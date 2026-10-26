import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { SearchPanel } from '../SearchPanel';

const mockNavigate = vi.fn();
const mockParams = vi.fn();
const mockServiceQuery = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate, useSearchParams: () => mockParams() }));
vi.mock('../../../lib/sonosApi', () => ({
  api: { search: { serviceQuery: (...a: unknown[]) => mockServiceQuery(...a) } },
}));
vi.mock('../../../hooks/useOpenItem', () => ({ useOpenItem: () => vi.fn() }));
vi.mock('../../../hooks/useOfficePresence', () => ({ useOfficePresence: () => ({ data: undefined }) }));
vi.mock('../../../hooks/useDjSet', () => ({ useDjSet: () => ({ data: undefined }) }));
vi.mock('../../../hooks/useDjDiscoveries', () => ({ useDjDiscoveries: () => ({ discoveries: [], isLoading: false }) }));
vi.mock('../SearchResults', () => ({
  SearchResults: ({ query }: { query: string }) => <div>Results for {query}</div>,
}));

const setQuery = (q?: string) => mockParams.mockReturnValue([new URLSearchParams(q ? { q } : {})]);
const renderPanel = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<SearchPanel />, { wrapper });
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('SearchPanel', () => {
  it('shows recent searches before anything is typed, and runs one on click', () => {
    localStorage.setItem('tt2.recentSearches', JSON.stringify(['Beyonce', 'Mr Brightside']));
    setQuery();
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Mr Brightside' }));
    expect(mockNavigate).toHaveBeenCalledWith('/search?q=Mr%20Brightside', { replace: true });
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByText('Recent searches')).not.toBeInTheDocument();
    expect(mockServiceQuery).not.toHaveBeenCalled();
  });

  it('shows the layout as a skeleton while the first results load, never a "Searching…" page', () => {
    setQuery('love');
    mockServiceQuery.mockReturnValue(new Promise(() => {}));
    renderPanel();
    expect(screen.getByLabelText('Searching')).toBeInTheDocument();
    expect(screen.queryByText('Searching…')).not.toBeInTheDocument();
  });

  it('says so when nothing matches', async () => {
    setQuery('zzqx');
    mockServiceQuery.mockResolvedValue({ data: { resourceOrder: [] } });
    renderPanel();
    expect(await screen.findByText('No results for ‘zzqx’')).toBeInTheDocument();
  });

  it('renders the results for the query', async () => {
    setQuery('mr brightside');
    mockServiceQuery.mockResolvedValue({
      data: {
        resourceOrder: ['TRACKS'],
        TRACKS: { resources: [{ name: 'Mr. Brightside', id: { objectId: 't', serviceId: 's', accountId: 'a' } }] },
      },
    });
    renderPanel();
    expect(await screen.findByText('Results for mr brightside')).toBeInTheDocument();
    expect(mockServiceQuery).toHaveBeenCalledWith('mr brightside', { count: 50 });
  });

  it('keeps an error an error, with Retry', async () => {
    setQuery('love');
    mockServiceQuery.mockResolvedValue({ error: 'busy' });
    renderPanel();
    const retry = await screen.findByRole('button', { name: 'Retry' }, { timeout: 4000 });
    expect(screen.queryByText(/No results/)).not.toBeInTheDocument();
    mockServiceQuery.mockResolvedValue({
      data: {
        resourceOrder: ['TRACKS'],
        TRACKS: { resources: [{ name: 'Love', id: { objectId: 't', serviceId: 's', accountId: 'a' } }] },
      },
    });
    fireEvent.click(retry);
    expect(await screen.findByText('Results for love')).toBeInTheDocument();
  });

  it('gives a dead end a hint and the recent searches', async () => {
    localStorage.setItem('tt2.recentSearches', JSON.stringify(['Beyonce']));
    setQuery('zzqx');
    mockServiceQuery.mockResolvedValue({ data: { resourceOrder: [] } });
    renderPanel();
    expect(await screen.findByText(/Check the spelling/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Beyonce' })).toBeInTheDocument();
  });

  it('names the page and announces the count', async () => {
    setQuery('mr brightside');
    mockServiceQuery.mockResolvedValue({
      data: {
        resourceOrder: ['TRACKS'],
        TRACKS: {
          resources: [
            { name: 'A', id: { objectId: 'a', serviceId: 's', accountId: 'x' } },
            { name: 'B', id: { objectId: 'b', serviceId: 's', accountId: 'x' } },
          ],
        },
      },
    });
    renderPanel();
    expect(screen.getByRole('heading', { level: 1, name: 'Results for ‘mr brightside’' })).toBeInTheDocument();
    expect(await screen.findByText('2 results')).toHaveAttribute('aria-live', 'polite');
  });
});
