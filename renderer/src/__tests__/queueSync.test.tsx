import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from '../App';

// Characterisation: how the app keeps the queue in step with Sonos (initial load, reload on a new
// queueVersion, reload when the WS session comes up).

const { pb } = vi.hoisted(() => ({ pb: { version: null as string | null } }));

vi.mock('../hooks/useAuth', () => ({ useAuth: () => true }));
vi.mock('../hooks/useGroups', () => ({
  useGroups: () => [{ id: 'g1', name: 'Room', coordinatorId: 'c1', playerIds: [] }],
}));
vi.mock('../hooks/usePlayback', () => ({
  usePlayback: () => ({
    playback: {
      queueId: 'q1',
      queueVersion: pb.version,
      isPlaying: false,
      currentObjectId: null,
      queueItemId: null,
      progress: 0,
      duration: 0,
      trackName: '',
      artist: '',
      artUrl: null,
      isNoGroups: false,
      shuffle: false,
      repeat: 'none',
      isVisible: true,
    },
    applyGroupCache: vi.fn(),
    queueIdRef: { current: 'q1' },
    queueVersionRef: { current: null },
  }),
}));
vi.mock('../hooks/useAutoplay', () => ({
  useAutoplay: () => ({ enabled: false, upcoming: [], fillerUri: null, setEnabled: () => {} }),
}));

let shown: { track: { title: string } }[] = [];
vi.mock('../components/queue/QueueSidebar', () => ({
  QueueSidebar: (props: { items: { track: { title: string } }[] }) => {
    shown = props.items;
    return null;
  },
}));
vi.mock('../components/HomePanel', () => ({ HomePanel: () => null, fetchYtmSections: vi.fn() }));
vi.mock('../components/TopNav', () => ({ TopNav: () => null }));
vi.mock('../components/PlayerBar', () => ({ PlayerBar: () => null }));
vi.mock('../components/Splash', () => ({ Splash: () => null }));
vi.mock('../components/MiniPlayer', () => ({ MiniPlayerShell: () => null }));
vi.mock('../components/DisplayNameModal', () => ({ DisplayNameModal: () => null }));

const mockFetch = vi.mocked(window.sonos.fetch);
const listCalls = () => mockFetch.mock.calls.filter((c) => c[0].operationId === 'getQueueResources').length;
let titles: string[];
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function tree() {
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <App />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  client.clear();
  pb.version = null;
  shown = [];
  titles = ['First'];
  mockFetch.mockImplementation(async (req: { operationId: string }) => {
    if (req.operationId === 'getQueueResources') return { data: { items: titles.map((name) => ({ name })) } };
    return { data: null };
  });
  vi.mocked(window.sonos.getActiveGroup).mockResolvedValue(null);
  vi.mocked(window.sonos.refreshAttribution).mockResolvedValue(undefined);
});

describe('queue sync', () => {
  it('loads the queue for the active group', async () => {
    render(tree());
    await waitFor(() => expect(shown.map((i) => i.track.title)).toEqual(['First']));
  });

  it('reloads when Sonos reports a new queueVersion', async () => {
    pb.version = 'v1';
    const { rerender } = render(tree());
    await waitFor(() => expect(shown).toHaveLength(1));
    await act(async () => {});
    const before = listCalls();

    titles = ['First', 'Second'];
    pb.version = 'v2';
    rerender(tree());
    await waitFor(() => expect(shown.map((i) => i.track.title)).toEqual(['First', 'Second']));
    expect(listCalls()).toBeGreaterThan(before);
  });

  it('does not reload for a version it has already seen', async () => {
    pb.version = 'v1';
    const { rerender } = render(tree());
    await waitFor(() => expect(shown).toHaveLength(1));
    await act(async () => {});
    const before = listCalls();
    rerender(tree());
    await act(async () => {});
    expect(listCalls()).toBe(before);
  });

  it('reloads when the WS session comes up', async () => {
    let wsReady: () => void = () => {};
    vi.mocked(window.sonos.onWsReady).mockImplementation((cb: () => void) => {
      wsReady = cb;
      return () => {};
    });
    render(tree());
    await waitFor(() => expect(shown).toHaveLength(1));
    titles = ['First', 'Second'];
    await act(async () => wsReady());
    await waitFor(() => expect(shown).toHaveLength(2));
  });
});
