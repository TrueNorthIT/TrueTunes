import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from '../App';
import type { SonosItem } from '../types/sonos';

// ── Hoisted refs so vi.mock factories (which are hoisted too) can reference them
const { mockQueueVersionRef, mockQueueIdRef } = vi.hoisted(() => ({
  mockQueueVersionRef: { current: null as string | null },
  mockQueueIdRef:      { current: null as string | null },
}));

// ── Hook mocks ────────────────────────────────────────────────────────────────

vi.mock('../hooks/useAuth',   () => ({ useAuth:   () => true }));
vi.mock('../hooks/useGroups', () => ({
  useGroups: () => [{ id: 'g1', name: 'Room', coordinatorId: 'c1', playerIds: [] }],
}));
vi.mock('../hooks/usePlayback', () => ({
  usePlayback: () => ({
    playback: {
      queueId: 'q1', queueVersion: null, isPlaying: false,
      currentObjectId: null, queueItemId: null,
      progress: 0, duration: 0, trackName: '', artist: '',
      artUrl: null, isNoGroups: false, shuffle: false, repeat: 'none',
      isVisible: true,
    },
    applyGroupCache: vi.fn(),
    queueIdRef:      mockQueueIdRef,
    queueVersionRef: mockQueueVersionRef,
  }),
}));

// ── Component stubs ───────────────────────────────────────────────────────────
// QueueSidebar and HomePanel capture onAddToQueue — either reference gives us
// the real handleAddToQueue closure from MainApp.

let capturedAddToQueue: ((item: SonosItem, position?: number) => void) | null = null;

vi.mock('../components/queue/QueueSidebar', () => ({
  QueueSidebar: (props: { onAddToQueue: (item: SonosItem, position?: number) => void }) => {
    capturedAddToQueue = props.onAddToQueue;
    return null;
  },
}));

vi.mock('../components/HomePanel', () => ({
  HomePanel: (props: { onAddToQueue: (item: SonosItem, position?: number) => void }) => {
    capturedAddToQueue = props.onAddToQueue;
    return null;
  },
  fetchYtmSections: vi.fn().mockResolvedValue({ sections: [] }),
}));

vi.mock('../components/TopNav',    () => ({ TopNav:    () => null }));
vi.mock('../components/PlayerBar', () => ({ PlayerBar: () => null }));
vi.mock('../components/Splash',    () => ({ Splash:    () => null }));
vi.mock('../components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: unknown }) => children,
}));
vi.mock('../components/MiniPlayer',       () => ({ MiniPlayerShell:   () => null }));
vi.mock('../components/DisplayNameModal', () => ({ DisplayNameModal:   () => null }));
vi.mock('../components/FeedbackDialog',   () => ({ FeedbackDialog:     () => null }));
vi.mock('../components/ChangelogDialog',  () => ({ ChangelogDialog:    () => null }));
vi.mock('../components/album/AlbumPanel',   () => ({ AlbumPanel:       () => null }));
vi.mock('../components/artist/ArtistPanel', () => ({ ArtistPanel:      () => null }));
vi.mock('../components/ContainerPanel',     () => ({ ContainerPanel:   () => null }));
vi.mock('../components/LeaderboardPanel',   () => ({ LeaderboardPanel: () => null }));
vi.mock('../components/QueuedlePanel',      () => ({ QueuedlePanel:    () => null }));

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockFetch = vi.mocked(window.sonos.fetch);

function makeTrackItem(): SonosItem {
  return {
    type: 'TRACK',
    name: 'Test Track',
    id: { objectId: 'obj1', serviceId: 'gm', accountId: 'acc1' },
    resource: { type: 'TRACK', id: { objectId: 'obj1', serviceId: 'gm', accountId: 'acc1' } },
  };
}

function makeAlbumItem(): SonosItem {
  return {
    type: 'ALBUM',
    name: 'Test Album',
    id: { objectId: 'alb1', serviceId: 'gm', accountId: 'acc1' },
    resource: { type: 'ALBUM', id: { objectId: 'alb1', serviceId: 'gm', accountId: 'acc1' } },
  };
}

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  capturedAddToQueue = null;
  mockQueueVersionRef.current = null;
  mockQueueIdRef.current = 'q1';
  vi.clearAllMocks();

  // Default: queue list resolves with an etag; everything else resolves empty.
  mockFetch.mockImplementation(async (req: { operationId: string }) => {
    if (req.operationId === 'getQueueResources')
      return { data: { items: [] }, etag: 'etag-v1' };
    return { data: null };
  });

  // getActiveGroup resolves null → App picks groups[0] ('g1')
  vi.mocked(window.sonos.getActiveGroup).mockResolvedValue(null);
  vi.mocked(window.sonos.refreshAttribution).mockResolvedValue(undefined);
  vi.mocked(window.sonos.trackEvent).mockResolvedValue(undefined);
});

/** Wait for initial mount: component captured + initial queue load fired onEtag */
async function mountAndSettle() {
  renderApp();
  await waitFor(() => {
    expect(capturedAddToQueue).not.toBeNull();
    expect(mockQueueVersionRef.current).toBe('etag-v1');
  });
}

// ─── success path ─────────────────────────────────────────────────────────────

describe('handleAddToQueue — success on first attempt', () => {
  it('calls addQueueResource exactly once', async () => {
    mockFetch.mockImplementation(async (req: { operationId: string }) => {
      if (req.operationId === 'getQueueResources') return { data: { items: [] }, etag: 'etag-v1' };
      if (req.operationId === 'addQueueResource')  return { data: {}, etag: 'etag-after' };
      return { data: null };
    });

    await mountAndSettle();
    await act(async () => { await capturedAddToQueue!(makeTrackItem()); });

    const addCalls = mockFetch.mock.calls.filter(c => c[0].operationId === 'addQueueResource');
    expect(addCalls).toHaveLength(1);
  });

  it('uses the current etag as the If-Match header', async () => {
    mockFetch.mockImplementation(async (req: { operationId: string }) => {
      if (req.operationId === 'getQueueResources') return { data: { items: [] }, etag: 'etag-v1' };
      if (req.operationId === 'addQueueResource')  return { data: {}, etag: 'etag-after' };
      return { data: null };
    });

    await mountAndSettle();
    await act(async () => { await capturedAddToQueue!(makeTrackItem()); });

    const [addCall] = mockFetch.mock.calls.filter(c => c[0].operationId === 'addQueueResource');
    expect(addCall[0].headers?.['If-Match']).toBe('etag-v1');
  });

  it('updates queueVersionRef with the etag from the response', async () => {
    mockFetch.mockImplementation(async (req: { operationId: string }) => {
      if (req.operationId === 'getQueueResources') return { data: { items: [] }, etag: 'etag-v1' };
      if (req.operationId === 'addQueueResource')  return { data: {}, etag: 'etag-after' };
      return { data: null };
    });

    await mountAndSettle();
    await act(async () => { await capturedAddToQueue!(makeTrackItem()); });

    expect(mockQueueVersionRef.current).toBe('etag-after');
  });

  it('does not show a toast', async () => {
    mockFetch.mockImplementation(async (req: { operationId: string }) => {
      if (req.operationId === 'getQueueResources') return { data: { items: [] }, etag: 'etag-v1' };
      if (req.operationId === 'addQueueResource')  return { data: {}, etag: 'etag-after' };
      return { data: null };
    });

    await mountAndSettle();
    await act(async () => { await capturedAddToQueue!(makeTrackItem()); });

    expect(screen.queryByText(/Add failed/)).toBeNull();
  });

  it('does not trigger an extra queue reload for a single track', async () => {
    mockFetch.mockImplementation(async (req: { operationId: string }) => {
      if (req.operationId === 'getQueueResources') return { data: { items: [] }, etag: 'etag-v1' };
      if (req.operationId === 'addQueueResource')  return { data: {}, etag: 'etag-after' };
      return { data: null };
    });

    await mountAndSettle();
    const listCountBefore = mockFetch.mock.calls.filter(c => c[0].operationId === 'getQueueResources').length;

    await act(async () => { await capturedAddToQueue!(makeTrackItem()); });

    const listCountAfter = mockFetch.mock.calls.filter(c => c[0].operationId === 'getQueueResources').length;
    expect(listCountAfter).toBe(listCountBefore); // no extra list call
  });
});

// ─── retry path ───────────────────────────────────────────────────────────────

describe('handleAddToQueue — retry after stale etag failure', () => {
  function makeRetryMock() {
    let listCount = 0;
    let addCount  = 0;
    mockFetch.mockImplementation(async (req: { operationId: string }) => {
      if (req.operationId === 'getQueueResources') {
        listCount++;
        return { data: { items: [] }, etag: listCount === 1 ? 'etag-v1' : 'etag-fresh' };
      }
      if (req.operationId === 'addQueueResource') {
        addCount++;
        if (addCount === 1) return { data: null, error: 'Precondition Failed' };
        return { data: {}, etag: 'etag-after-retry' };
      }
      return { data: null };
    });
    return { getListCount: () => listCount, getAddCount: () => addCount };
  }

  it('reloads the queue to get a fresh etag', async () => {
    const { getListCount } = makeRetryMock();
    await mountAndSettle();
    const listBefore = getListCount();

    await act(async () => { await capturedAddToQueue!(makeTrackItem()); });

    // At least one reload fires to refresh the etag before the retry.
    // A second reload may also fire afterwards to sync the UI.
    expect(getListCount()).toBeGreaterThanOrEqual(listBefore + 1);
  });

  it('retries addQueueResource with the fresh etag', async () => {
    makeRetryMock();
    await mountAndSettle();
    await act(async () => { await capturedAddToQueue!(makeTrackItem()); });

    const addCalls = mockFetch.mock.calls.filter(c => c[0].operationId === 'addQueueResource');
    expect(addCalls).toHaveLength(2);
    expect(addCalls[1][0].headers?.['If-Match']).toBe('etag-fresh');
  });

  it('does not show a toast when the retry succeeds', async () => {
    makeRetryMock();
    await mountAndSettle();
    await act(async () => { await capturedAddToQueue!(makeTrackItem()); });

    expect(screen.queryByText(/Add failed/)).toBeNull();
  });

  it('queueVersionRef holds the latest etag after retry completes', async () => {
    makeRetryMock();
    await mountAndSettle();
    await act(async () => { await capturedAddToQueue!(makeTrackItem()); });

    // The post-retry reloadQueue fires and overwrites with the list response etag —
    // that is the authoritative version after the queue settles.
    expect(mockQueueVersionRef.current).toBe('etag-fresh');
  });
});

// ─── double failure ───────────────────────────────────────────────────────────

describe('handleAddToQueue — double failure shows toast', () => {
  function makeDoubleFailMock() {
    let listCount = 0;
    mockFetch.mockImplementation(async (req: { operationId: string }) => {
      if (req.operationId === 'getQueueResources') {
        listCount++;
        return { data: { items: [] }, etag: listCount === 1 ? 'etag-v1' : 'etag-fresh' };
      }
      if (req.operationId === 'addQueueResource')
        return { data: null, error: 'Precondition Failed' };
      return { data: null };
    });
    return { getListCount: () => listCount };
  }

  it('shows an error toast', async () => {
    makeDoubleFailMock();
    await mountAndSettle();
    await act(async () => { await capturedAddToQueue!(makeTrackItem()); });

    expect(screen.getByText(/Add failed/)).toBeInTheDocument();
  });

  it('calls addQueueResource twice (original + retry)', async () => {
    makeDoubleFailMock();
    await mountAndSettle();
    await act(async () => { await capturedAddToQueue!(makeTrackItem()); });

    const addCalls = mockFetch.mock.calls.filter(c => c[0].operationId === 'addQueueResource');
    expect(addCalls).toHaveLength(2);
  });

  it('reloads queue once between attempts to get a fresh etag', async () => {
    const { getListCount } = makeDoubleFailMock();
    await mountAndSettle();
    const listBefore = getListCount();

    await act(async () => { await capturedAddToQueue!(makeTrackItem()); });

    expect(getListCount()).toBe(listBefore + 1);
  });
});

// ─── non-track (album) ────────────────────────────────────────────────────────

describe('handleAddToQueue — non-track item', () => {
  it('reloads queue after a successful album add', async () => {
    let listCount = 0;
    mockFetch.mockImplementation(async (req: { operationId: string }) => {
      if (req.operationId === 'getQueueResources') { listCount++; return { data: { items: [] }, etag: 'etag-v1' }; }
      if (req.operationId === 'addQueueResource')  return { data: {}, etag: 'etag-after' };
      return { data: null };
    });

    await mountAndSettle();
    const listBefore = listCount;

    await act(async () => { await capturedAddToQueue!(makeAlbumItem()); });

    // reloadQueue fires (and a delayed second reload after 1500 ms — not waited here)
    expect(listCount).toBeGreaterThan(listBefore);
  });

  it('publishes 1 album event + N per-track events when an album is added', async () => {
    const albumTracks = [
      { title: 'Track A', ordinal: 1, duration: 180, images: { tile1x1: 'art' }, resource: { id: { objectId: 'trk-a', serviceId: 'gm', accountId: 'acc1' } } },
      { title: 'Track B', ordinal: 2, duration: 200, images: { tile1x1: 'art' }, resource: { id: { objectId: 'trk-b', serviceId: 'gm', accountId: 'acc1' } } },
      { title: 'Track C', ordinal: 3, duration: 220, images: { tile1x1: 'art' }, resource: { id: { objectId: 'trk-c', serviceId: 'gm', accountId: 'acc1' } } },
    ];
    mockFetch.mockImplementation(async (req: { operationId: string }) => {
      if (req.operationId === 'getQueueResources') return { data: { items: [] }, etag: 'etag-v1' };
      if (req.operationId === 'addQueueResource')  return { data: {}, etag: 'etag-after' };
      if (req.operationId === 'browseAlbum')       return { data: { title: 'Test Album', tracks: { items: albumTracks, total: albumTracks.length } } };
      if (req.operationId === 'getTrackNowPlaying') return { data: {} }; // empty body — parseResponse tolerates it; publish uses fallback trackName
      return { data: null };
    });
    const publishMock = vi.mocked(window.sonos.publishQueued).mockResolvedValue(undefined);

    await mountAndSettle();
    await act(async () => { await capturedAddToQueue!(makeAlbumItem()); });

    // Wait for the fan-out: 1 album event + 3 track events.
    await waitFor(() => expect(publishMock).toHaveBeenCalledTimes(4));

    const calls = publishMock.mock.calls.map(([arg]) => arg);
    const albumEvents = calls.filter(c => c.eventType === 'album');
    const trackEvents = calls.filter(c => c.eventType === 'track');
    expect(albumEvents).toHaveLength(1);
    expect(trackEvents).toHaveLength(3);

    // Album event uses the album URI; track events use track URIs (never the album URI).
    expect(albumEvents[0].uri).toBe('alb1');
    const trackUris = trackEvents.map(e => e.uri).sort();
    expect(trackUris).toEqual(['trk-a', 'trk-b', 'trk-c']);
  });
});
