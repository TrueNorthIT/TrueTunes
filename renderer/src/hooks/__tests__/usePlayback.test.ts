import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePlayback } from '../usePlayback';
import type { PlaybackPayload } from '../../types/sonos';

// ── WS callback capture ───────────────────────────────────────────────────────

let wsHandler:    ((header: unknown, payload: unknown) => void) | null = null;
let readyHandler: (() => void) | null = null;

beforeEach(() => {
  wsHandler    = null;
  readyHandler = null;
  vi.clearAllMocks();

  vi.mocked(window.sonos.onWsMessage).mockImplementation((cb) => {
    wsHandler = cb;
    return () => {};
  });
  vi.mocked(window.sonos.onWsReady).mockImplementation((cb) => {
    readyHandler = cb;
    return () => {};
  });
});

// ── Payload factories ─────────────────────────────────────────────────────────

function makePayload(overrides: Partial<PlaybackPayload> = {}): PlaybackPayload {
  return {
    playback: {
      playbackState: 'PLAYBACK_STATE_PLAYING',
      positionMillis: 30000,
      queueId: 'q1',
      queueVersion: 'v1',
      itemId: 'qi1',
      playModes: { shuffle: false, repeat: false, repeatOne: false },
    },
    metadata: {
      currentItem: {
        track: {
          name: 'Test Track',
          artist: { name: 'Test Artist' },
          durationMillis: 180000,
          id: { objectId: 'obj1', serviceId: 'gm', accountId: 'acc1' },
          images: [{ url: 'https://img.example.com/art.jpg' }],
          album: { name: 'Test Album', id: { objectId: 'alb1' } },
          explicit: false,
        },
      },
    },
    ...overrides,
  };
}

/** Fire a playbackExtended WS message for the given group. */
function firePlayback(payload: PlaybackPayload, groupId = 'g1') {
  act(() => { wsHandler!({ namespace: 'playbackExtended', groupId }, payload); });
}

/** Fire a groupVolume WS message. */
function fireVolume(volume: number, groupId = 'g1') {
  act(() => { wsHandler!({ namespace: 'groupVolume', groupId }, { volume }); });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('usePlayback — initial state', () => {
  it('starts with IDLE_STATE (not visible, no track)', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    expect(result.current.playback.isVisible).toBe(false);
    expect(result.current.playback.trackName).toBe('');
    expect(result.current.playback.isPlaying).toBe(false);
  });

  it('exposes stable queueIdRef and queueVersionRef', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    expect(result.current.queueIdRef.current).toBeNull();
    expect(result.current.queueVersionRef.current).toBeNull();
  });
});

describe('usePlayback — onWsReady', () => {
  it('sets isVisible true when the WS session is ready', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    act(() => { readyHandler!(); });
    expect(result.current.playback.isVisible).toBe(true);
  });
});

describe('usePlayback — track name and artist', () => {
  it('reads track name and artist object', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    firePlayback(makePayload());
    expect(result.current.playback.trackName).toBe('Test Track');
    expect(result.current.playback.artistName).toBe('Test Artist');
  });

  it('falls back to track.title when name is absent', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    firePlayback(makePayload({
      metadata: { currentItem: { track: { title: 'Via Title', artist: 'Someone', durationMillis: 0 } } },
    }));
    expect(result.current.playback.trackName).toBe('Via Title');
  });

  it('handles artist as a plain string', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    firePlayback(makePayload({
      metadata: { currentItem: { track: { name: 'T', artist: 'String Artist', durationMillis: 0 } } },
    }));
    expect(result.current.playback.artistName).toBe('String Artist');
  });

  it('returns empty artistName when artist is absent', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    firePlayback(makePayload({
      metadata: { currentItem: { track: { name: 'T', durationMillis: 0 } } },
    }));
    expect(result.current.playback.artistName).toBe('');
  });
});

describe('usePlayback — progress and timing', () => {
  it('computes progressPct as posMs / durMs * 100', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    firePlayback(makePayload({
      playback: { playbackState: 'PLAYING', positionMillis: 60000, queueId: 'q1', queueVersion: 'v1', playModes: {} },
      metadata: { currentItem: { track: { name: 'T', artist: 'A', durationMillis: 120000 } } },
    }));
    expect(result.current.playback.progressPct).toBeCloseTo(50);
  });

  it('clamps progressPct to 100 when posMs > durMs', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    firePlayback(makePayload({
      playback: { playbackState: 'PLAYING', positionMillis: 999999, queueId: 'q1', queueVersion: 'v1', playModes: {} },
      metadata: { currentItem: { track: { name: 'T', artist: 'A', durationMillis: 180000 } } },
    }));
    expect(result.current.playback.progressPct).toBe(100);
  });

  it('sets progressPct to 0 when durMs is 0', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    firePlayback(makePayload({
      playback: { playbackState: 'PLAYING', positionMillis: 10000, queueId: 'q1', queueVersion: 'v1', playModes: {} },
      metadata: { currentItem: { track: { name: 'T', artist: 'A', durationMillis: 0 } } },
    }));
    expect(result.current.playback.progressPct).toBe(0);
  });

  it('builds a timeLabel when duration is known', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    firePlayback(makePayload({
      playback: { playbackState: 'PLAYING', positionMillis: 65000, queueId: 'q1', queueVersion: 'v1', playModes: {} },
      metadata: { currentItem: { track: { name: 'T', artist: 'A', durationMillis: 183000 } } },
    }));
    expect(result.current.playback.timeLabel).toBe('1:05 / 3:03');
  });

  it('sets empty timeLabel when duration is 0', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    firePlayback(makePayload({
      metadata: { currentItem: { track: { name: 'T', artist: 'A', durationMillis: 0 } } },
    }));
    expect(result.current.playback.timeLabel).toBe('');
  });
});

describe('usePlayback — playback state', () => {
  it('sets isPlaying true and stateIcon ▶ when PLAYING', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    firePlayback(makePayload({
      playback: { playbackState: 'PLAYBACK_STATE_PLAYING', positionMillis: 0, queueId: 'q1', queueVersion: 'v1', playModes: {} },
    }));
    expect(result.current.playback.isPlaying).toBe(true);
    expect(result.current.playback.stateIcon).toBe('▶');
  });

  it('sets isPlaying false and stateIcon ⏸ when PAUSED', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    firePlayback(makePayload({
      playback: { playbackState: 'PLAYBACK_STATE_PAUSED', positionMillis: 0, queueId: 'q1', queueVersion: 'v1', playModes: {} },
    }));
    expect(result.current.playback.isPlaying).toBe(false);
    expect(result.current.playback.stateIcon).toBe('⏸');
  });

  it('keeps previous volume on non-NO_GROUPS payload', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    fireVolume(72);
    firePlayback(makePayload({
      playback: { playbackState: 'PLAYING', positionMillis: 0, queueId: 'q1', queueVersion: 'v1', playModes: {} },
    }));
    expect(result.current.playback.volume).toBe(72);
  });

  it('zeros volume when playbackState is NO_GROUPS', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    fireVolume(80);
    firePlayback(makePayload({
      playback: { playbackState: 'NO_GROUPS', positionMillis: 0, queueId: 'q1', queueVersion: 'v1', playModes: {} },
    }));
    expect(result.current.playback.volume).toBe(0);
  });
});

describe('usePlayback — play modes', () => {
  it('sets shuffle true when playModes.shuffle is true', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    firePlayback(makePayload({
      playback: { playbackState: 'PLAYING', positionMillis: 0, queueId: 'q1', queueVersion: 'v1', playModes: { shuffle: true } },
    }));
    expect(result.current.playback.shuffle).toBe(true);
  });

  it('sets repeat "one" when repeatOne is true', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    firePlayback(makePayload({
      playback: { playbackState: 'PLAYING', positionMillis: 0, queueId: 'q1', queueVersion: 'v1', playModes: { repeatOne: true } },
    }));
    expect(result.current.playback.repeat).toBe('one');
  });

  it('sets repeat "all" when repeat is true and repeatOne is false', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    firePlayback(makePayload({
      playback: { playbackState: 'PLAYING', positionMillis: 0, queueId: 'q1', queueVersion: 'v1', playModes: { repeat: true, repeatOne: false } },
    }));
    expect(result.current.playback.repeat).toBe('all');
  });

  it('sets repeat "none" when both repeat flags are false', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    firePlayback(makePayload({
      playback: { playbackState: 'PLAYING', positionMillis: 0, queueId: 'q1', queueVersion: 'v1', playModes: { repeat: false, repeatOne: false } },
    }));
    expect(result.current.playback.repeat).toBe('none');
  });
});

describe('usePlayback — art URL', () => {
  it('picks the first https:// image URL', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    firePlayback(makePayload({
      metadata: { currentItem: { track: {
        name: 'T', artist: 'A', durationMillis: 0,
        images: [
          { url: 'http://insecure.example.com/img.jpg' },
          { url: 'https://secure.example.com/img.jpg' },
        ],
      } } },
    }));
    expect(result.current.playback.artUrl).toBe('https://secure.example.com/img.jpg');
  });

  it('falls back to imageUrl when images array has no https entry', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    firePlayback(makePayload({
      metadata: { currentItem: { track: {
        name: 'T', artist: 'A', durationMillis: 0,
        images: [],
        imageUrl: 'https://fallback.example.com/img.jpg',
      } } },
    }));
    expect(result.current.playback.artUrl).toBe('https://fallback.example.com/img.jpg');
  });

  it('sets artUrl null when no images are available', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    firePlayback(makePayload({
      metadata: { currentItem: { track: { name: 'T', artist: 'A', durationMillis: 0, images: [] } } },
    }));
    expect(result.current.playback.artUrl).toBeNull();
  });
});

describe('usePlayback — explicit flag', () => {
  it('reads explicit from track.explicit', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    firePlayback(makePayload({
      metadata: { currentItem: { track: { name: 'T', artist: 'A', durationMillis: 0, explicit: true } } },
    }));
    expect(result.current.playback.isExplicit).toBe(true);
  });

  it('reads explicit from track.isExplicit (legacy field)', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    firePlayback(makePayload({
      metadata: { currentItem: { track: { name: 'T', artist: 'A', durationMillis: 0, isExplicit: true } as never } },
    }));
    expect(result.current.playback.isExplicit).toBe(true);
  });
});

describe('usePlayback — album metadata', () => {
  it('reads currentAlbumName and currentAlbumId from track.album', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    firePlayback(makePayload());
    expect(result.current.playback.currentAlbumName).toBe('Test Album');
    expect(result.current.playback.currentAlbumId).toBe('alb1');
  });

  it('reads currentObjectId, currentServiceId, currentAccountId from track.id', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    firePlayback(makePayload());
    expect(result.current.playback.currentObjectId).toBe('obj1');
    expect(result.current.playback.currentServiceId).toBe('gm');
    expect(result.current.playback.currentAccountId).toBe('acc1');
  });
});

describe('usePlayback — queue cursor refs', () => {
  it('updates queueIdRef and queueVersionRef from the payload', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    firePlayback(makePayload());
    expect(result.current.queueIdRef.current).toBe('q1');
    expect(result.current.queueVersionRef.current).toBe('v1');
  });

  it('calls window.sonos.setQueueId when queueId is present', () => {
    renderHook(() => usePlayback('g1'));
    firePlayback(makePayload());
    expect(window.sonos.setQueueId).toHaveBeenCalledWith('q1');
  });
});

describe('usePlayback — no track name (queue-cursor-only path)', () => {
  it('does not set trackName or isVisible when payload has no track name', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    firePlayback(makePayload({
      metadata: { currentItem: { track: { durationMillis: 0 } } },
    }));
    expect(result.current.playback.trackName).toBe('');
    expect(result.current.playback.isVisible).toBe(false);
  });

  it('still updates queueId in state when track name is absent', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    firePlayback(makePayload({
      playback: { playbackState: 'PLAYING', positionMillis: 0, queueId: 'q-new', queueVersion: 'v-new', itemId: 'qi2', playModes: {} },
      metadata: { currentItem: { track: { durationMillis: 0 } } },
    }));
    expect(result.current.playback.queueId).toBe('q-new');
    expect(result.current.playback.queueVersion).toBe('v-new');
    expect(result.current.playback.queueItemId).toBe('qi2');
  });
});

describe('usePlayback — group filtering', () => {
  it('applies payloads for the active group', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    firePlayback(makePayload(), 'g1');
    expect(result.current.playback.trackName).toBe('Test Track');
  });

  it('ignores payloads for a different group', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    firePlayback(makePayload(), 'g2');
    expect(result.current.playback.trackName).toBe('');
  });

  it('caches payloads for all groups regardless of active group', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    // Fire a payload for g2 — ignored for state but should be cached
    const g2Payload = makePayload({
      metadata: { currentItem: { track: { name: 'G2 Track', artist: 'B', durationMillis: 0 } } },
    });
    firePlayback(g2Payload, 'g2');

    // Switch to g2 — the cached payload should be applied
    act(() => { result.current.applyGroupCache('g2'); });
    expect(result.current.playback.trackName).toBe('G2 Track');
  });
});

describe('usePlayback — groupVolume namespace', () => {
  it('updates volume from groupVolume messages', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    fireVolume(65);
    expect(result.current.playback.volume).toBe(65);
  });

  it('does not affect other state fields', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    firePlayback(makePayload());
    const trackNameBefore = result.current.playback.trackName;
    fireVolume(40);
    expect(result.current.playback.trackName).toBe(trackNameBefore);
  });
});

describe('usePlayback — applyGroupCache', () => {
  it('shows "Nothing playing" when no cache entry exists for the group', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    act(() => { result.current.applyGroupCache('g2'); });
    expect(result.current.playback.trackName).toBe('Nothing playing');
    expect(result.current.playback.isVisible).toBe(true);
  });

  it('applies cached payload when switching to a group with history', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    // Cache a payload for g1 by firing a WS message
    firePlayback(makePayload({ metadata: { currentItem: { track: { name: 'Cached Song', artist: 'X', durationMillis: 0 } } } }), 'g1');

    // Switch away and back
    act(() => { result.current.applyGroupCache('g2'); });
    act(() => { result.current.applyGroupCache('g1'); });
    expect(result.current.playback.trackName).toBe('Cached Song');
  });

  it('clears queueVersionRef on group switch (prevents stale etag)', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    firePlayback(makePayload()); // populates queueVersionRef = 'v1'
    expect(result.current.queueVersionRef.current).toBe('v1');

    act(() => { result.current.applyGroupCache('g2'); });
    expect(result.current.queueVersionRef.current).toBeNull();
  });

  it('clears queueIdRef on group switch', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    firePlayback(makePayload());
    expect(result.current.queueIdRef.current).toBe('q1');

    act(() => { result.current.applyGroupCache('g2'); });
    expect(result.current.queueIdRef.current).toBeNull();
  });

  it('filters out WS messages from the old group immediately after switch', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    act(() => { result.current.applyGroupCache('g2'); });

    // A message still tagged g1 should now be ignored
    firePlayback(makePayload({ metadata: { currentItem: { track: { name: 'Old Group Track', artist: 'X', durationMillis: 0 } } } }), 'g1');
    expect(result.current.playback.trackName).toBe('Nothing playing');
  });
});

describe('usePlayback — progress tick', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('advances progressPct over time while playing', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    // Start at 50% (90s / 180s)
    firePlayback(makePayload({
      playback: { playbackState: 'PLAYBACK_STATE_PLAYING', positionMillis: 90000, queueId: 'q1', queueVersion: 'v1', playModes: {} },
      metadata: { currentItem: { track: { name: 'T', artist: 'A', durationMillis: 180000 } } },
    }));
    const initialPct = result.current.playback.progressPct;

    act(() => { vi.advanceTimersByTime(5000); });

    expect(result.current.playback.progressPct).toBeGreaterThan(initialPct);
  });

  it('does not tick when paused', () => {
    const { result } = renderHook(() => usePlayback('g1'));
    firePlayback(makePayload({
      playback: { playbackState: 'PLAYBACK_STATE_PAUSED', positionMillis: 90000, queueId: 'q1', queueVersion: 'v1', playModes: {} },
      metadata: { currentItem: { track: { name: 'T', artist: 'A', durationMillis: 180000 } } },
    }));
    const initialPct = result.current.playback.progressPct;

    act(() => { vi.advanceTimersByTime(5000); });

    expect(result.current.playback.progressPct).toBe(initialPct);
  });
});
