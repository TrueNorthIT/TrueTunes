import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { RemoteContext } from '../../RemoteContext';
import type { Remote } from '../../useRemote';
import { ToastContext } from '../../context/ToastContext';
import { useAddToQueueImpl } from '../../useAddToQueueImpl';
import type { SonosItem } from '../../types/sonos';

type Fetch = (req: { operationId: string; query?: Record<string, string>; body?: unknown; headers?: Record<string, string> }) => Promise<unknown>;

const track = (): SonosItem =>
  ({
    title: 'Loser',
    type: 'ITEM_TRACK',
    subtitle: 'Beck',
    resource: { type: 'TRACK', id: { objectId: 't1', serviceId: '9', accountId: 'sn_42' } },
  }) as unknown as SonosItem;

const album = (): SonosItem =>
  ({
    title: 'Odelay',
    type: 'ITEM_ALBUM',
    subtitle: 'Beck',
    resource: { type: 'ALBUM', id: { objectId: 'a1', serviceId: '9', accountId: 'sn_42' } },
  }) as unknown as SonosItem;

const playlist = (): SonosItem =>
  ({
    title: 'Mix',
    type: 'PLAYLIST',
    resource: { type: 'PLAYLIST', id: { objectId: 'p1', serviceId: '9', accountId: 'sn_42' } },
  }) as unknown as SonosItem;

const program = (): SonosItem =>
  ({
    title: 'Radio',
    type: 'PROGRAM',
    resource: { type: 'PROGRAM', id: { objectId: 'r1', serviceId: '9', accountId: 'sn_42' } },
  }) as unknown as SonosItem;

let setItems: ReturnType<typeof vi.fn>;
let reload: ReturnType<typeof vi.fn>;
let reloadRaw: ReturnType<typeof vi.fn>;
let showToast: ReturnType<typeof vi.fn<(m: string, t?: "error" | "success" | "info") => void>>;
let queueVersionRef: { current: string | null };
let queueItems: unknown[];
let fetchMock: ReturnType<typeof vi.fn<Fetch>>;

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const remote = {
    activeGroupId: 'g1',
    playback: { currentObjectId: null, queueItemId: null },
    queue: { items: queueItems, setItems, isLoading: false, error: null, reload, reloadRaw },
    queueIdRef: { current: 'q1' },
    queueVersionRef,
  } as unknown as Remote;
  return (
    <QueryClientProvider client={qc}>
      <ToastContext.Provider value={{ showToast }}>
        <RemoteContext.Provider value={remote}>{children}</RemoteContext.Provider>
      </ToastContext.Provider>
    </QueryClientProvider>
  );
}

const addCalls = () => fetchMock.mock.calls.filter((c) => c[0].operationId === 'addQueueResource').map((c) => c[0]);
const published = () => vi.mocked(window.sonos.publishQueued).mock.calls.map((c) => c[0] as Record<string, unknown>);

beforeEach(() => {
  setItems = vi.fn();
  reload = vi.fn();
  reloadRaw = vi.fn(async () => {});
  showToast = vi.fn<(m: string, t?: "error" | "success" | "info") => void>();
  queueVersionRef = { current: 'etag-1' };
  queueItems = [];
  fetchMock = vi.fn<Fetch>(async (req) => (req.operationId === 'addQueueResource' ? { data: {}, etag: 'etag-2' } : new Promise(() => {})));
  vi.mocked(window.sonos.fetch).mockReset().mockImplementation(fetchMock as never);
  vi.mocked(window.sonos.publishQueued).mockReset().mockResolvedValue(undefined as never);
  vi.mocked(window.sonos.trackEvent).mockClear();
  vi.mocked(window.sonos.loadContent).mockReset();
});

describe('useAddToQueueImpl', () => {
  it('adds a single track: optimistic insert, stripped account, etag, position', async () => {
    const { result } = renderHook(() => useAddToQueueImpl(), { wrapper });
    await act(() => result.current.addToQueue(track()));

    expect(setItems).toHaveBeenCalledTimes(1);
    const updater = setItems.mock.calls[0][0] as (p: { index: number }[]) => { index: number }[];
    expect(updater([{ index: 0 }, { index: 1 }]).map((i) => i.index)).toEqual([0, 1, 2]);

    const [req] = addCalls();
    expect(req.body).toEqual({ id: { objectId: 't1', serviceId: '9', accountId: '42' }, type: 'TRACK' });
    expect(req.query).toEqual({ position: '-1' });
    expect(req.headers).toEqual({ 'If-Match': 'etag-1' });
    expect(queueVersionRef.current).toBe('etag-2');
    expect(reload).not.toHaveBeenCalled();
    expect(window.sonos.trackEvent).toHaveBeenCalledWith('queue_add', { success: 'true', itemType: 'TRACK' });
  });

  it('inserts at an explicit position', async () => {
    const { result } = renderHook(() => useAddToQueueImpl(), { wrapper });
    await act(() => result.current.addToQueue(track(), 1));
    const updater = setItems.mock.calls[0][0] as (p: { index: number; id?: string }[]) => { index: number }[];
    const out = updater([{ index: 0, id: 'a' }, { index: 1, id: 'b' }]);
    expect(out).toHaveLength(3);
    expect(out.map((i) => i.index)).toEqual([0, 1, 2]);
    expect(addCalls()[0].query).toEqual({ position: '1' });
  });

  it('retries once after reloading on a stale etag', async () => {
    let n = 0;
    fetchMock.mockImplementation(async (req) => {
      if (req.operationId !== 'addQueueResource') return new Promise(() => {});
      return n++ === 0 ? { error: 'precondition failed' } : { data: {}, etag: 'etag-3' };
    });
    reloadRaw.mockImplementation(async () => {
      queueVersionRef.current = 'etag-fresh';
    });
    const { result } = renderHook(() => useAddToQueueImpl(), { wrapper });
    await act(() => result.current.addToQueue(track()));

    const calls = addCalls();
    expect(calls).toHaveLength(2);
    expect(calls[1].headers).toEqual({ 'If-Match': 'etag-fresh' });
    expect(reloadRaw).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
    expect(published()).toHaveLength(1);
  });

  it('toasts and skips attribution when the add fails', async () => {
    fetchMock.mockImplementation(async (req) => (req.operationId === 'addQueueResource' ? { error: 'boom' } : new Promise(() => {})));
    const { result } = renderHook(() => useAddToQueueImpl(), { wrapper });
    await act(() => result.current.addToQueue(track()));

    expect(addCalls()).toHaveLength(2);
    expect(showToast).toHaveBeenCalledWith('Add failed: boom', 'error');
    expect(published()).toHaveLength(0);
    expect(window.sonos.trackEvent).toHaveBeenCalledWith('queue_add', { success: 'false', itemType: 'TRACK' });
  });

  it('publishes a track attribution event for a track', async () => {
    const { result } = renderHook(() => useAddToQueueImpl(), { wrapper });
    await act(() => result.current.addToQueue(track()));
    expect(published()).toHaveLength(1);
    expect(published()[0]).toMatchObject({ eventType: 'track', uri: 't1', trackName: 'Loser', serviceId: '9', accountId: '42' });
  });

  it('publishes an album event for an album (and survives a failed browse)', async () => {
    fetchMock.mockImplementation(async (req) => {
      if (req.operationId === 'addQueueResource') return { data: {}, etag: 'e' };
      throw new Error('nope');
    });
    const { result } = renderHook(() => useAddToQueueImpl(), { wrapper });
    await act(() => result.current.addToQueue(album()));
    expect(addCalls()[0].body).toMatchObject({ type: 'ALBUM' });
    expect(published()).toHaveLength(1);
    expect(published()[0]).toMatchObject({ eventType: 'album', uri: 'a1', albumId: 'a1', accountId: '42', artist: 'Beck' });
    expect(setItems).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalled();
  });

  it('fans out per-track events for a playlist', async () => {
    fetchMock.mockImplementation(async (req) => {
      if (req.operationId === 'addQueueResource') return { data: {}, etag: 'e' };
      if (req.operationId === 'browsePlaylist') {
        return {
          data: {
            tracks: {
              items: [
                { title: 'One', artists: [{ name: 'A' }], resource: { id: { objectId: 'x1', serviceId: '9', accountId: 'sn_7' } } },
                { title: 'Two', artists: [{ name: 'B' }], resource: { id: { objectId: 'x2', serviceId: '9', accountId: 'sn_7' } } },
              ],
            },
          },
        };
      }
      return new Promise(() => {});
    });
    const { result } = renderHook(() => useAddToQueueImpl(), { wrapper });
    await act(() => result.current.addToQueue(playlist()));
    await waitFor(() => expect(published()).toHaveLength(2));
    expect(published().map((p) => p.uri)).toEqual(['x1', 'x2']);
    expect(published()[0]).toMatchObject({ eventType: 'track', trackName: 'One', artist: 'A', accountId: '7' });
  });

  it('attribute:false suppresses attribution', async () => {
    const { result } = renderHook(() => useAddToQueueImpl(), { wrapper });
    await act(() => result.current.addToQueue(track(), -1, { attribute: false }));
    await act(() => result.current.addToQueue(album(), -1, { attribute: false }));
    expect(addCalls()).toHaveLength(2);
    expect(published()).toHaveLength(0);
  });

  it('program items go through loadContent, not the queue API', async () => {
    vi.mocked(window.sonos.loadContent).mockResolvedValueOnce({} as never);
    const { result } = renderHook(() => useAddToQueueImpl(), { wrapper });
    await act(() => result.current.addToQueue(program()));
    expect(window.sonos.loadContent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PROGRAM', queueAction: 'REPLACE', id: { objectId: 'r1', accountId: 'sn_42', serviceId: '9' } }),
    );
    expect(addCalls()).toHaveLength(0);
    expect(reload).toHaveBeenCalled();
  });

  it('toasts when a program fails to load', async () => {
    vi.mocked(window.sonos.loadContent).mockResolvedValueOnce({ error: 'nope' } as never);
    const { result } = renderHook(() => useAddToQueueImpl(), { wrapper });
    await act(() => result.current.addToQueue(program()));
    expect(showToast).toHaveBeenCalledWith('Play failed: nope', 'error');
    expect(reload).not.toHaveBeenCalled();
  });

  it('places a user add in front of the autoplay filler, but not the filler itself', async () => {
    queueItems = [
      { index: 0, track: { id: 'a' } },
      { index: 1, track: { id: 'filler' } },
    ];
    vi.mocked(window.sonos.djAutoplay).mockResolvedValue({
      enabled: true, leaseHeld: false, enqueue: null, upcoming: [], fillerUri: 'filler',
    });
    const { result } = renderHook(() => useAddToQueueImpl(), { wrapper });
    await waitFor(() => expect(result.current.autoplay.fillerUri).toBe('filler'));

    await act(() => result.current.addToQueue(track()));
    expect(addCalls()[0].query).toEqual({ position: '1' });

    await act(() => result.current.addToQueue(track(), -1, { djFiller: true, attribute: false }));
    expect(addCalls()[1].query).toEqual({ position: '-1' });
  });
});
