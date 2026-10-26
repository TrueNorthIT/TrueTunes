import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { containerQueryOptions, useContainerBrowse } from '../useContainerBrowse';
import { homeKeys } from '../useYtmHome';
import { ShelfGoneError } from '../../lib/ytmSections';
import { runQueryFn } from '../../test/queryFn';
import type { SonosItem } from '../../types/sonos';

const mockFetch = vi.mocked(window.sonos.fetch);

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({ data: null });
});

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe('useContainerBrowse', () => {
  it('does not fetch when containerId is undefined', () => {
    renderHook(() => useContainerBrowse(undefined, 'svc', 'acc'), { wrapper });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not fetch when serviceId is undefined', () => {
    renderHook(() => useContainerBrowse('cont-1', undefined, 'acc'), { wrapper });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches and returns items when all params provided', async () => {
    const mockData = {
      container: {
        items: [{ type: 'TRACK', title: 'Song A', resource: { type: 'TRACK', id: {} } }],
      },
    };
    mockFetch.mockResolvedValueOnce({ data: mockData });

    const { result } = renderHook(() => useContainerBrowse('cont-1', 'svc', 'acc'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeInstanceOf(Array);
    expect(mockFetch).toHaveBeenCalledWith(expect.objectContaining({ operationId: 'browseContainer' }));
  });

  it('returns error when response has error field', async () => {
    mockFetch.mockResolvedValue({ data: null, error: 'Not found' });
    const { result } = renderHook(() => useContainerBrowse('cont-1', 'svc', 'acc'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false), { timeout: 3000 }); // after the one retry
    expect(result.current.error).toBeTruthy();
  });
});

describe('containerQueryOptions: expired YouTube Music shelf ids', () => {
  const shelf = (title: string, id: string): SonosItem =>
    ({
      title,
      resource: { type: 'CONTAINER', id: { objectId: id, serviceId: 'svc', accountId: 'acc' }, defaults: `def-${id}` },
    }) as SonosItem;
  const root = { sections: { items: [{ items: [shelf('Home', 'home'), shelf('Library', 'lib')] }] } };
  const empty = { section: { items: [] } };
  const albums = (n: number) => ({
    section: { items: Array.from({ length: n }, (_, i) => ({ title: `Album ${i}` })) },
  });
  const containerOf = (c: unknown) => (c as { pathParams?: { containerId?: string } }).pathParams?.containerId;
  const browsed = () => mockFetch.mock.calls.map(([c]) => containerOf(c));

  it('returns the items when the id still works, without looking anything up', async () => {
    mockFetch.mockResolvedValueOnce({ data: albums(3) });
    const items = await runQueryFn(containerQueryOptions('nr-1', 'svc', 'acc', 'def', { title: 'New releases' }));
    expect(items).toHaveLength(3);
    expect(browsed()).toEqual(['nr-1']);
  });

  it('re-finds the shelf by title inside Home when the old id comes back empty, and browses the fresh id', async () => {
    mockFetch.mockImplementation(async (c: unknown) => {
      const id = containerOf(c);
      if (id === 'root') return { data: root };
      if (id === 'home')
        return { data: { section: { items: [shelf('Quick picks', 'qp-2'), shelf('New releases', 'nr-2')] } } };
      if (id === 'nr-2') return { data: albums(2) };
      return { data: empty }; // the expired id
    });
    const onRecovered = vi.fn();
    const items = await runQueryFn(
      containerQueryOptions('nr-1', 'svc', 'acc', 'def-old', { title: 'New releases' }, onRecovered)
    );
    expect(items.map((i) => i.title)).toEqual(['Album 0', 'Album 1']);
    expect(browsed()).toEqual(['nr-1', 'root', 'home', 'nr-2']);
    // The fresh shelf is browsed with its own defaults, which the BFF needs to fill the section.
    expect(mockFetch).toHaveBeenLastCalledWith(
      expect.objectContaining({ query: expect.objectContaining({ defaults: 'def-nr-2', muse2: 'true' }) })
    );
    expect(onRecovered).toHaveBeenCalledOnce();
  });

  it('prefers a root entry with that title (accounts that list New releases at the root)', async () => {
    const rootWithNr = { sections: { items: [{ items: [shelf('Home', 'home'), shelf('New releases', 'nr-root')] }] } };
    mockFetch.mockImplementation(async (c: unknown) => {
      const id = containerOf(c);
      if (id === 'root') return { data: rootWithNr };
      if (id === 'nr-root') return { data: albums(1) };
      return { data: empty };
    });
    const items = await runQueryFn(containerQueryOptions('nr-1', 'svc', 'acc', undefined, { title: 'New releases' }));
    expect(items).toHaveLength(1);
    expect(browsed()).toEqual(['nr-1', 'root', 'nr-root']);
  });

  it('fails with ShelfGoneError, and refreshes Home, when Home no longer carries a shelf by that title', async () => {
    mockFetch.mockImplementation(async (c: unknown) => {
      const id = containerOf(c);
      if (id === 'root') return { data: root };
      if (id === 'home') return { data: { section: { items: [shelf('Mine', 'mine')] } } };
      return { data: empty };
    });
    const onHomeStale = vi.fn();
    await expect(
      runQueryFn(containerQueryOptions('x', 'svc', 'acc', undefined, { title: 'Something else' }, onHomeStale))
    ).rejects.toBeInstanceOf(ShelfGoneError);
    expect(onHomeStale).toHaveBeenCalledOnce();
  });

  it('is not retried when the shelf has gone (other errors keep the one retry)', () => {
    const retry = containerQueryOptions('x', 'svc', 'acc').retry as (n: number, e: Error) => boolean;
    expect(retry(0, new ShelfGoneError('Quick picks'))).toBe(false);
    expect(retry(0, new Error('busy'))).toBe(true);
    expect(retry(1, new Error('busy'))).toBe(false);
  });

  it("doesn't call a shelf gone when it can't tell (another service's container, or Home failed to load)", async () => {
    mockFetch.mockImplementation(async (c: unknown) => {
      const id = containerOf(c);
      if (id === 'root') return { data: root };
      if (id === 'home') return { data: { section: { items: [shelf('Mine', 'mine')] } } };
      return { data: empty };
    });
    const onHomeStale = vi.fn();
    expect(
      await runQueryFn(containerQueryOptions('x', 'other-svc', 'acc', undefined, { title: 'Gone' }, onHomeStale))
    ).toEqual([]);
    mockFetch.mockImplementation(async (c: unknown) => {
      const id = containerOf(c);
      if (id === 'root') return { data: root };
      if (id === 'home') return { data: null, error: 'busy' };
      return { data: empty };
    });
    expect(
      await runQueryFn(containerQueryOptions('x', 'svc', 'acc', undefined, { title: 'Gone' }, onHomeStale))
    ).toEqual([]);
    expect(onHomeStale).not.toHaveBeenCalled();
  });

  it('stays empty for a genuinely empty container (the shelf found is the same id)', async () => {
    mockFetch.mockImplementation(async (c: unknown) => {
      const id = containerOf(c);
      if (id === 'root') return { data: root };
      if (id === 'home') return { data: { section: { items: [shelf('Mine', 'mine')] } } };
      return { data: empty };
    });
    const onRecovered = vi.fn();
    expect(
      await runQueryFn(containerQueryOptions('mine', 'svc', 'acc', undefined, { title: 'Mine' }, onRecovered))
    ).toEqual([]);
    expect(browsed()).toEqual(['mine', 'root', 'home']); // found itself: not browsed twice
    expect(onRecovered).not.toHaveBeenCalled();
  });

  it('stays empty when the fresh shelf is empty too', async () => {
    mockFetch.mockImplementation(async (c: unknown) => {
      const id = containerOf(c);
      if (id === 'root') return { data: root };
      if (id === 'home') return { data: { section: { items: [shelf('New releases', 'nr-2')] } } };
      return { data: empty };
    });
    const onRecovered = vi.fn();
    expect(
      await runQueryFn(containerQueryOptions('nr-1', 'svc', 'acc', undefined, { title: 'New releases' }, onRecovered))
    ).toEqual([]);
    expect(onRecovered).not.toHaveBeenCalled();
  });

  it('does not look anything up without a title', async () => {
    mockFetch.mockResolvedValueOnce({ data: empty });
    expect(await runQueryFn(containerQueryOptions('x', 'svc', 'acc'))).toEqual([]);
    expect(browsed()).toEqual(['x']);
  });

  it('keeps the empty result when the lookup fails', async () => {
    mockFetch.mockImplementation(async (c: unknown) =>
      containerOf(c) === 'root' ? { data: null, error: 'boom' } : { data: empty }
    );
    expect(await runQueryFn(containerQueryOptions('x', 'svc', 'acc', undefined, { title: 'New releases' }))).toEqual(
      []
    );
  });

  it('picks between shelves that share a title by their artwork', async () => {
    const topSongs = (id: string, art: string) =>
      ({ ...shelf('Top songs', id), images: { tile1x1: art } }) as unknown as SonosItem; // browse items carry { tile1x1 }
    mockFetch.mockImplementation(async (c: unknown) => {
      const id = containerOf(c);
      if (id === 'root') return { data: root };
      if (id === 'home')
        return {
          data: {
            section: { items: [topSongs('top-a2', 'art-a'), topSongs('top-b2', 'art-b'), topSongs('top-c2', 'art-c')] },
          },
        };
      if (id === 'top-b2') return { data: albums(4) };
      return { data: empty };
    });
    const items = await runQueryFn(
      containerQueryOptions('top-b1', 'svc', 'acc', undefined, { title: 'Top songs', art: 'art-b' })
    );
    expect(items).toHaveLength(4);
    expect(browsed()).toEqual(['top-b1', 'root', 'home', 'top-b2']);
  });

  it('falls back to the first same-titled shelf when no artwork matches', async () => {
    const topSongs = (id: string, art: string) =>
      ({ ...shelf('Top songs', id), images: { tile1x1: art } }) as unknown as SonosItem; // browse items carry { tile1x1 }
    mockFetch.mockImplementation(async (c: unknown) => {
      const id = containerOf(c);
      if (id === 'root') return { data: root };
      if (id === 'home')
        return { data: { section: { items: [topSongs('top-a2', 'art-a'), topSongs('top-b2', 'art-b')] } } };
      if (id === 'top-a2') return { data: albums(2) };
      return { data: empty };
    });
    const items = await runQueryFn(
      containerQueryOptions('top-x1', 'svc', 'acc', undefined, { title: 'Top songs', art: 'art-gone' })
    );
    expect(items).toHaveLength(2);
  });
});

describe('useContainerBrowse: refreshing Home after a recovery', () => {
  it("invalidates Home's YouTube Music sections so its cards get fresh ids", async () => {
    const containerOf = (c: unknown) => (c as { pathParams?: { containerId?: string } }).pathParams?.containerId;
    const item = (title: string, id: string) => ({
      title,
      resource: { type: 'CONTAINER', id: { objectId: id, serviceId: 'svc', accountId: 'acc' } },
    });
    mockFetch.mockImplementation(async (c: unknown) => {
      const id = containerOf(c);
      if (id === 'root') return { data: { sections: { items: [{ items: [item('Home', 'home')] }] } } };
      if (id === 'home') return { data: { section: { items: [item('New releases', 'nr-2')] } } };
      if (id === 'nr-2') return { data: { section: { items: [{ title: 'Fresh album' }] } } };
      return { data: { section: { items: [] } } };
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    const w = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children);
    const { result } = renderHook(
      () => useContainerBrowse('nr-1', 'svc', 'acc', undefined, { title: 'New releases' }),
      {
        wrapper: w,
      }
    );
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: homeKeys.ytm });
  });

  it('refreshes Home quietly and reports the shelf gone, once, when it has dropped off Home', async () => {
    const containerOf = (c: unknown) => (c as { pathParams?: { containerId?: string } }).pathParams?.containerId;
    const item = (title: string, id: string) => ({
      title,
      resource: { type: 'CONTAINER', id: { objectId: id, serviceId: 'svc', accountId: 'acc' } },
    });
    mockFetch.mockImplementation(async (c: unknown) => {
      const id = containerOf(c);
      if (id === 'root') return { data: { sections: { items: [{ items: [item('Home', 'home')] }] } } };
      if (id === 'home') return { data: { section: { items: [item('Quick picks', 'qp-2')] } } };
      return { data: { section: { items: [] } } };
    });
    // The app's default of one retry: a gone shelf still isn't retried.
    const qc = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    const w = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children);
    const { result } = renderHook(
      () => useContainerBrowse('mix-1', 'svc', 'acc', undefined, { title: 'Mixed for you: chill' }),
      { wrapper: w }
    );
    await waitFor(() => expect(result.current.error).toBeInstanceOf(ShelfGoneError));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: homeKeys.ytm });
    expect(mockFetch.mock.calls.filter(([c]) => containerOf(c) === 'mix-1')).toHaveLength(1);
  });
});
