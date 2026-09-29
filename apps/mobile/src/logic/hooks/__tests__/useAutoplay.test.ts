import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAutoplay } from '../useAutoplay';
import type { NormalizedQueueItem } from '../../types/provider';

const item = (id: string): NormalizedQueueItem =>
  ({ index: 0, track: { id, title: id, name: id, artist: 'Band' } }) as unknown as NormalizedQueueItem;

const track: DjTrack = {
  uri: 'dj-1',
  trackName: 'Loser',
  artist: 'Tame Impala',
  score: 0.5,
  because: 'the office plays this',
};

beforeEach(() => {
  vi.mocked(window.sonos.djAutoplay).mockReset();
  vi.mocked(window.sonos.fetchDjSet).mockReset();
  localStorage.clear();
});

describe('useAutoplay', () => {
  it('reports the queue and now-playing to the coordinator', async () => {
    vi.mocked(window.sonos.djAutoplay).mockResolvedValue({
      enabled: true, leaseHeld: false, enqueue: null, upcoming: [track], fillerUri: null,
    });

    renderHook(() =>
      useAutoplay({
        groupId: 'g1',
        items: [item('a'), item('b')],
        nowPlayingUri: 'a',
        onEnqueue: vi.fn(),
      }),
    );

    await waitFor(() => expect(window.sonos.djAutoplay).toHaveBeenCalled());
    expect(vi.mocked(window.sonos.djAutoplay).mock.calls[0][0]).toMatchObject({
      groupId: 'g1',
      queueUris: ['a', 'b'],
      nowPlayingUri: 'a',
    });
  });

  /**
   * Sonos can hand a queued track back under a different objectId (issue #84).
   * Without a name-based identity the coordinator loses its own filler, decides
   * the add failed, and re-queues the same pick forever.
   */
  it('sends name keys alongside uris, index-aligned', async () => {
    vi.mocked(window.sonos.djAutoplay).mockResolvedValue({
      enabled: true, leaseHeld: false, enqueue: null, upcoming: [], fillerUri: null,
    });
    vi.mocked(window.sonos.fetchDjSet).mockResolvedValue({
      tracks: [], artists: [], listeners: [], artistsConsidered: 0, inferredListeners: true,
    });

    renderHook(() =>
      useAutoplay({
        groupId: 'g1',
        items: [item('a'), item('b')],
        nowPlayingUri: 'a',
        onEnqueue: vi.fn(),
      }),
    );

    await waitFor(() => expect(window.sonos.djAutoplay).toHaveBeenCalled());
    const sent = vi.mocked(window.sonos.djAutoplay).mock.calls[0][0];
    expect(sent.queueKeys).toHaveLength(sent.queueUris.length);
    expect(sent.queueKeys?.[0]).toBe('a||band');
    // The playhead needs the same identity to be locatable after a re-key.
    expect(sent.nowPlayingKey).toBe('a||band');
  });

  /** The whole point of the lease: four clients must not add four fillers. */
  it('only enqueues when it holds the lease', async () => {
    const onEnqueue = vi.fn();
    vi.mocked(window.sonos.djAutoplay).mockResolvedValue({
      enabled: true, leaseHeld: false, enqueue: track, upcoming: [track], fillerUri: null,
    });

    renderHook(() =>
      useAutoplay({ groupId: 'g1', items: [], nowPlayingUri: null, onEnqueue }),
    );

    await waitFor(() => expect(window.sonos.djAutoplay).toHaveBeenCalled());
    expect(onEnqueue).not.toHaveBeenCalled();
  });

  it('enqueues the coordinator’s pick when it does hold the lease', async () => {
    const onEnqueue = vi.fn();
    vi.mocked(window.sonos.djAutoplay).mockResolvedValue({
      enabled: true, leaseHeld: true, enqueue: track, upcoming: [track], fillerUri: 'dj-1',
    });

    const { result } = renderHook(() =>
      useAutoplay({ groupId: 'g1', items: [], nowPlayingUri: null, onEnqueue }),
    );

    await waitFor(() => expect(onEnqueue).toHaveBeenCalledWith(track));
    await waitFor(() => expect(result.current.fillerUri).toBe('dj-1'));
  });

  it('still previews before a group has been picked', async () => {
    vi.mocked(window.sonos.fetchDjSet).mockResolvedValue({
      tracks: [track], artists: [], listeners: [], artistsConsidered: 1, inferredListeners: true,
    });

    const { result } = renderHook(() =>
      useAutoplay({ groupId: null, items: [], nowPlayingUri: null, onEnqueue: vi.fn() }),
    );

    // No group means no coordination — but the preview is still worth showing.
    await waitFor(() => expect(result.current.upcoming).toHaveLength(1));
    expect(window.sonos.djAutoplay).not.toHaveBeenCalled();
  });

  /** Each Sonos group is its own queue, with its own session and lease. */
  it('coordinates per group', async () => {
    vi.mocked(window.sonos.djAutoplay).mockResolvedValue({
      enabled: true, leaseHeld: true, enqueue: null, upcoming: [track], fillerUri: 'dj-1',
    });

    const { rerender } = renderHook(
      ({ groupId }) => useAutoplay({ groupId, items: [], nowPlayingUri: null, onEnqueue: vi.fn() }),
      { initialProps: { groupId: 'kitchen' as string | null } },
    );
    await waitFor(() => expect(window.sonos.djAutoplay).toHaveBeenCalled());
    expect(vi.mocked(window.sonos.djAutoplay).mock.calls[0][0].groupId).toBe('kitchen');

    rerender({ groupId: 'studio' });
    await waitFor(() =>
      expect(
        vi.mocked(window.sonos.djAutoplay).mock.calls.some((c) => c[0].groupId === 'studio'),
      ).toBe(true),
    );
  });

  it('drops the old room’s filler the moment the group changes', async () => {
    vi.mocked(window.sonos.djAutoplay).mockResolvedValue({
      enabled: true, leaseHeld: false, enqueue: null, upcoming: [track], fillerUri: 'dj-1',
    });

    const { result, rerender } = renderHook(
      ({ groupId }) => useAutoplay({ groupId, items: [], nowPlayingUri: null, onEnqueue: vi.fn() }),
      { initialProps: { groupId: 'kitchen' as string | null } },
    );
    await waitFor(() => expect(result.current.fillerUri).toBe('dj-1'));

    // A stale fillerUri decides where user tracks get inserted, so it must not
    // survive into a queue it has nothing to do with.
    vi.mocked(window.sonos.djAutoplay).mockImplementation(() => new Promise(() => {}));
    rerender({ groupId: 'studio' });
    expect(result.current.fillerUri).toBeNull();
    expect(result.current.upcoming).toEqual([]);
  });

  it('reuses one client id across mounts so the lease does not bounce', async () => {
    vi.mocked(window.sonos.djAutoplay).mockResolvedValue({
      enabled: false, leaseHeld: false, enqueue: null, upcoming: [], fillerUri: null,
    });

    const opts = { groupId: 'g1', items: [], nowPlayingUri: null, onEnqueue: vi.fn() };
    const first = renderHook(() => useAutoplay(opts));
    await waitFor(() => expect(window.sonos.djAutoplay).toHaveBeenCalled());
    first.unmount();

    renderHook(() => useAutoplay(opts));
    await waitFor(() => expect(window.sonos.djAutoplay).toHaveBeenCalledTimes(2));

    const calls = vi.mocked(window.sonos.djAutoplay).mock.calls;
    expect(calls[0][0].clientId).toBe(calls[1][0].clientId);
  });

  it('survives the coordinator being unreachable', async () => {
    vi.mocked(window.sonos.djAutoplay).mockRejectedValue(new Error('offline'));
    vi.mocked(window.sonos.fetchDjSet).mockResolvedValue({
      tracks: [], artists: [], listeners: [], artistsConsidered: 0, inferredListeners: true,
    });
    const onEnqueue = vi.fn();

    const { result } = renderHook(() =>
      useAutoplay({ groupId: 'g1', items: [], nowPlayingUri: null, onEnqueue }),
    );

    await waitFor(() => expect(window.sonos.djAutoplay).toHaveBeenCalled());
    expect(result.current.upcoming).toEqual([]);
    // Crucially it must never enqueue on a guess — only the coordinator grants that.
    expect(onEnqueue).not.toHaveBeenCalled();
  });

  /** The preview is "what would play next" — it must not need the coordinator. */
  it('falls back to the DJ endpoint when the coordinator is unreachable', async () => {
    vi.mocked(window.sonos.djAutoplay).mockRejectedValue(new Error('offline'));
    vi.mocked(window.sonos.fetchDjSet).mockResolvedValue({
      tracks: [track],
      artists: [],
      listeners: [],
      artistsConsidered: 1,
      inferredListeners: true,
    });

    const { result } = renderHook(() =>
      useAutoplay({ groupId: 'g1', items: [], nowPlayingUri: null, onEnqueue: vi.fn() }),
    );

    await waitFor(() => expect(result.current.upcoming).toHaveLength(1));
    expect(result.current.upcoming[0].trackName).toBe('Loser');
  });

  it('fills the preview when the coordinator answers with nothing', async () => {
    vi.mocked(window.sonos.djAutoplay).mockResolvedValue({
      enabled: false, leaseHeld: false, enqueue: null, upcoming: [], fillerUri: null,
    });
    vi.mocked(window.sonos.fetchDjSet).mockResolvedValue({
      tracks: [track],
      artists: [],
      listeners: [],
      artistsConsidered: 1,
      inferredListeners: true,
    });

    const { result } = renderHook(() =>
      useAutoplay({ groupId: 'g1', items: [], nowPlayingUri: null, onEnqueue: vi.fn() }),
    );

    await waitFor(() => expect(result.current.upcoming).toHaveLength(1));
  });

  it('never lets the stand-in overwrite what is really parked', async () => {
    vi.mocked(window.sonos.djAutoplay).mockResolvedValue({
      enabled: true, leaseHeld: false, enqueue: null,
      upcoming: [{ ...track, uri: 'real', trackName: 'Actually Parked' }],
      fillerUri: 'real',
    });

    const { result } = renderHook(() =>
      useAutoplay({ groupId: 'g1', items: [], nowPlayingUri: null, onEnqueue: vi.fn() }),
    );

    await waitFor(() => expect(result.current.upcoming[0].trackName).toBe('Actually Parked'));
    expect(window.sonos.fetchDjSet).not.toHaveBeenCalled();
  });

  /**
   * Sonos gives the playing track's queue position directly. Deriving it from
   * objectIds or names is what kept failing — ids get re-keyed and the event
   * log formats artists differently from the live queue.
   */
  it('reports the playhead position, converted to a zero-based index', async () => {
    vi.mocked(window.sonos.djAutoplay).mockResolvedValue({
      enabled: true, leaseHeld: false, enqueue: null, upcoming: [track], fillerUri: null,
    });

    renderHook(() =>
      useAutoplay({
        groupId: 'g1',
        items: [item('a'), item('b'), item('c')],
        nowPlayingUri: 'b',
        nowPlayingQueueItemId: '2',
        onEnqueue: vi.fn(),
      }),
    );

    await waitFor(() => expect(window.sonos.djAutoplay).toHaveBeenCalled());
    expect(vi.mocked(window.sonos.djAutoplay).mock.calls[0][0].nowPlayingIndex).toBe(1);
  });

  it('sends no index when the player does not report one', async () => {
    vi.mocked(window.sonos.djAutoplay).mockResolvedValue({
      enabled: true, leaseHeld: false, enqueue: null, upcoming: [track], fillerUri: null,
    });

    renderHook(() =>
      useAutoplay({
        groupId: 'g1',
        items: [item('a')],
        nowPlayingUri: 'a',
        nowPlayingQueueItemId: null,
        onEnqueue: vi.fn(),
      }),
    );

    await waitFor(() => expect(window.sonos.djAutoplay).toHaveBeenCalled());
    expect(vi.mocked(window.sonos.djAutoplay).mock.calls[0][0].nowPlayingIndex).toBeNull();
  });
});
