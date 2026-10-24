import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useQueue, useEditQueue, queueKeys, type QueueData } from '../useQueue';

const mockFetch = vi.mocked(window.sonos.fetch);

function wrapper(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  mockFetch.mockReset();
});

function queueResponse(items: unknown[] = [], etag?: string) {
  return { data: { items }, ...(etag ? { etag } : {}) };
}

// ─── initial load ─────────────────────────────────────────────────────────────

describe('useQueue — initial load', () => {
  it('does not fetch when not authed', () => {
    renderHook(() => useQueue(false, 'g1', 'q1'), { wrapper: wrapper() });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not fetch when activeGroupId is null', () => {
    renderHook(() => useQueue(true, null, 'q1'), { wrapper: wrapper() });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches queue when authed with a group', async () => {
    mockFetch.mockResolvedValue(queueResponse());
    renderHook(() => useQueue(true, 'g1', 'q1'), { wrapper: wrapper() });
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(expect.objectContaining({ operationId: 'getQueueResources' }))
    );
  });

  it('fires onEtag with etag from first page', async () => {
    mockFetch.mockResolvedValue(queueResponse([], 'etag-v1'));
    const onEtag = vi.fn();
    renderHook(() => useQueue(true, 'g1', 'q1', onEtag), { wrapper: wrapper() });
    await waitFor(() => expect(onEtag).toHaveBeenCalledWith('etag-v1'));
  });

  it('does not fire onEtag when response has no etag', async () => {
    mockFetch.mockResolvedValue(queueResponse());
    const onEtag = vi.fn();
    renderHook(() => useQueue(true, 'g1', 'q1', onEtag), { wrapper: wrapper() });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    await act(async () => {});
    expect(onEtag).not.toHaveBeenCalled();
  });

  it('does not fire onEtag when list returns an error', async () => {
    mockFetch.mockResolvedValue({ data: null, error: 'server error' });
    const onEtag = vi.fn();
    renderHook(() => useQueue(true, 'g1', 'q1', onEtag), { wrapper: wrapper() });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    await act(async () => {});
    expect(onEtag).not.toHaveBeenCalled();
  });

  it('sets items from response', async () => {
    const items = [{ type: 'TRACK', name: 'Song A' }];
    mockFetch.mockResolvedValue(queueResponse(items));
    const { result } = renderHook(() => useQueue(true, 'g1', 'q1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.items[0].track.title).toBe('Song A');
  });

  it('clears isLoading after load completes', async () => {
    mockFetch.mockResolvedValue(queueResponse());
    const { result } = renderHook(() => useQueue(true, 'g1', 'q1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('sets error when list call fails', async () => {
    mockFetch.mockResolvedValue({ data: null, error: 'not found' });
    const { result } = renderHook(() => useQueue(true, 'g1', 'q1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.error).toBe('not found'));
  });
});

// ─── pagination ───────────────────────────────────────────────────────────────

describe('useQueue — pagination', () => {
  it('fetches a second page when first page is full (50 items)', async () => {
    const page1 = Array.from({ length: 50 }, (_, i) => ({ type: 'TRACK', name: `T${i}` }));
    const page2 = [{ type: 'TRACK', name: 'Last' }];
    mockFetch
      .mockResolvedValueOnce({ data: { items: page1 }, etag: 'v1' })
      .mockResolvedValueOnce({ data: { items: page2 } });
    const { result } = renderHook(() => useQueue(true, 'g1', 'q1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.items).toHaveLength(51));
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('fires onEtag only once, from the first page', async () => {
    const page1 = Array.from({ length: 50 }, (_, i) => ({ type: 'TRACK', name: `T${i}` }));
    mockFetch
      .mockResolvedValueOnce({ data: { items: page1 }, etag: 'etag-page1' })
      .mockResolvedValueOnce({ data: { items: [] } });
    const onEtag = vi.fn();
    renderHook(() => useQueue(true, 'g1', 'q1', onEtag), { wrapper: wrapper() });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(onEtag).toHaveBeenCalledTimes(1);
    expect(onEtag).toHaveBeenCalledWith('etag-page1');
  });

  it('stops fetching when a page returns fewer than 50 items', async () => {
    const items = Array.from({ length: 25 }, (_, i) => ({ name: `T${i}` }));
    mockFetch.mockResolvedValue({ data: { items } });
    const { result } = renderHook(() => useQueue(true, 'g1', 'q1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.items).toHaveLength(25));
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ─── reload ───────────────────────────────────────────────────────────────────

describe('useQueue — reload', () => {
  it('re-fetches and fires onEtag with the fresh etag', async () => {
    mockFetch
      .mockResolvedValueOnce(queueResponse([], 'etag-initial'))
      .mockResolvedValueOnce(queueResponse([], 'etag-fresh'));
    const onEtag = vi.fn();
    const { result } = renderHook(() => useQueue(true, 'g1', 'q1', onEtag), { wrapper: wrapper() });
    await waitFor(() => expect(onEtag).toHaveBeenCalledWith('etag-initial'));

    await act(async () => {
      await result.current.reload();
    });

    expect(onEtag).toHaveBeenCalledTimes(2);
    expect(onEtag).toHaveBeenLastCalledWith('etag-fresh');
  });

  it('updates items on reload', async () => {
    mockFetch
      .mockResolvedValueOnce(queueResponse([{ name: 'Old Song' }]))
      .mockResolvedValueOnce(queueResponse([{ name: 'New Song' }]));
    const { result } = renderHook(() => useQueue(true, 'g1', 'q1'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.items[0]?.track.title).toBe('Old Song'));
    await act(async () => {
      await result.current.reload();
    });
    await waitFor(() => expect(result.current.items[0]?.track.title).toBe('New Song'));
  });

  it('does not fire onEtag on reload when list response has no etag', async () => {
    mockFetch.mockResolvedValueOnce(queueResponse([], 'etag-initial')).mockResolvedValueOnce(queueResponse([]));
    const onEtag = vi.fn();
    const { result } = renderHook(() => useQueue(true, 'g1', 'q1', onEtag), { wrapper: wrapper() });
    await waitFor(() => expect(onEtag).toHaveBeenCalledWith('etag-initial'));
    onEtag.mockClear();

    await act(async () => {
      await result.current.reload();
    });

    expect(onEtag).not.toHaveBeenCalled();
  });
});

// ─── reload error handling ────────────────────────────────────────────────────

describe('useQueue — reload error handling', () => {
  it('keeps existing items visible and routes the error to onReloadError when a background reload fails', async () => {
    mockFetch
      .mockResolvedValueOnce(queueResponse([{ name: 'Old Song' }], 'etag-v1'))
      .mockResolvedValueOnce({ data: null, error: '500 Internal Server Error' });
    const onReloadError = vi.fn();
    const { result } = renderHook(() => useQueue(true, 'g1', 'q1', undefined, onReloadError), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.items[0]?.track.title).toBe('Old Song'));

    await act(async () => {
      await result.current.reload();
    });

    await waitFor(() => expect(onReloadError).toHaveBeenCalledWith('500 Internal Server Error'));
    expect(result.current.error).toBeNull();
    expect(result.current.items[0]?.track.title).toBe('Old Song');
  });

  it('still surfaces the error in state when the very first load fails (no items yet)', async () => {
    mockFetch.mockResolvedValueOnce({ data: null, error: '500 Internal Server Error' });
    const onReloadError = vi.fn();
    const { result } = renderHook(() => useQueue(true, 'g1', 'q1', undefined, onReloadError), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.error).toBe('500 Internal Server Error'));
    expect(result.current.items).toHaveLength(0);
    expect(onReloadError).not.toHaveBeenCalled();
  });
});

// ─── version pushes ───────────────────────────────────────────────────────────

describe('useQueue — queueVersion', () => {
  it('refetches when Sonos reports a new queueVersion, and not otherwise', async () => {
    mockFetch
      .mockResolvedValueOnce(queueResponse([{ name: 'Old' }]))
      .mockResolvedValueOnce(queueResponse([{ name: 'New' }]));
    const { result, rerender } = renderHook(
      ({ v }: { v: string }) => useQueue(true, 'g1', 'q1', undefined, undefined, v),
      { wrapper: wrapper(), initialProps: { v: 'v1' } }
    );
    await waitFor(() => expect(result.current.items[0]?.track.title).toBe('Old'));
    rerender({ v: 'v1' });
    await act(async () => {});
    expect(mockFetch).toHaveBeenCalledTimes(1);
    rerender({ v: 'v2' });
    await waitFor(() => expect(result.current.items[0]?.track.title).toBe('New'));
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

// ─── optimistic edits ─────────────────────────────────────────────────────────

describe('useEditQueue', () => {
  it('applies an update to the cached queue and rolls it back', async () => {
    const client = new QueryClient();
    mockFetch.mockResolvedValue(queueResponse([{ name: 'A' }, { name: 'B' }], 'e1'));
    const { result } = renderHook(() => ({ q: useQueue(true, 'g1', 'q1'), edit: useEditQueue('g1') }), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.q.items).toHaveLength(2));

    let undo = () => {};
    act(() => {
      undo = result.current.edit((prev) => prev.slice(1));
    });
    await waitFor(() => expect(result.current.q.items.map((i) => i.track.title)).toEqual(['B']));
    expect(client.getQueryData<QueueData>(queueKeys.list('g1'))?.etag).toBe('e1');

    act(() => undo());
    await waitFor(() => expect(result.current.q.items.map((i) => i.track.title)).toEqual(['A', 'B']));
  });

  it('does nothing without a group', () => {
    const client = new QueryClient();
    const { result } = renderHook(() => useEditQueue(null), { wrapper: wrapper(client) });
    act(() => result.current([]));
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });
});
