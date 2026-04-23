import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { useNowPlaying } from '../useNowPlaying';
import type { PlaybackState } from '../usePlayback';

// Mock sub-hooks with controllable return values
const mockTrackDetails = vi.fn();
vi.mock('../useTrackDetails', () => ({
  useTrackDetails: (...args: unknown[]) => mockTrackDetails(...args),
}));

vi.mock('../useImage', () => ({ useImage: (url: string | null) => url ?? null }));
vi.mock('../useDominantColor', () => ({ useDominantColor: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  mockTrackDetails.mockReturnValue({ data: undefined });
});

function makePlayback(overrides: Partial<PlaybackState> = {}): PlaybackState {
  return {
    isVisible: true,
    trackName: 'Default Track',
    artistName: 'Default Artist',
    artUrl: null,
    stateIcon: '▶',
    timeLabel: '1:30 / 4:00',
    progressPct: 37,
    durationMs: 240000,
    isPlaying: true,
    shuffle: false,
    repeat: 'none',
    volume: 50,
    currentObjectId: 'obj-1',
    currentServiceId: 'svc-1',
    currentAccountId: 'acc-1',
    currentAlbumId: null,
    currentAlbumName: null,
    isExplicit: false,
    queueId: null,
    queueVersion: null,
    ...overrides,
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient();
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe('useNowPlaying', () => {
  it('passes through trackName and artistName from playback when no track details', () => {
    const { result } = renderHook(
      () => useNowPlaying(makePlayback({ trackName: 'My Song', artistName: 'My Artist' })),
      { wrapper }
    );
    expect(result.current.displayTrack).toBe('My Song');
    expect(result.current.displayArtist).toBe('My Artist');
  });

  it('prefers track details over playback values when available', () => {
    mockTrackDetails.mockReturnValue({ data: { trackName: 'Enriched Song', artist: 'Enriched Artist', artUrl: null } });
    const { result } = renderHook(
      () => useNowPlaying(makePlayback({ trackName: 'Fallback', artistName: 'Fallback Artist' })),
      { wrapper }
    );
    expect(result.current.displayTrack).toBe('Enriched Song');
    expect(result.current.displayArtist).toBe('Enriched Artist');
  });

  it('splits timeLabel into elapsedLabel and durationLabel', () => {
    const { result } = renderHook(
      () => useNowPlaying(makePlayback({ timeLabel: '2:15 / 5:30' })),
      { wrapper }
    );
    expect(result.current.elapsedLabel).toBe('2:15');
    expect(result.current.durationLabel).toBe('5:30');
  });

  it('returns empty strings when timeLabel is empty', () => {
    const { result } = renderHook(
      () => useNowPlaying(makePlayback({ timeLabel: '' })),
      { wrapper }
    );
    expect(result.current.elapsedLabel).toBe('');
    expect(result.current.durationLabel).toBe('');
  });

  it('passes through progressPct, durationMs, isPlaying, isVisible', () => {
    const { result } = renderHook(
      () => useNowPlaying(makePlayback({ progressPct: 42, durationMs: 180000, isPlaying: false, isVisible: false })),
      { wrapper }
    );
    expect(result.current.progressPct).toBe(42);
    expect(result.current.durationMs).toBe(180000);
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.isVisible).toBe(false);
  });

  it('returns albumItem when albumId is available in track details', () => {
    mockTrackDetails.mockReturnValue({
      data: {
        trackName: 'Song',
        artist: 'Artist',
        artUrl: null,
        albumId: 'alb-1',
        albumName: 'Great Album',
        serviceId: 'svc',
        accountId: 'acc',
      },
    });
    const { result } = renderHook(
      () => useNowPlaying(makePlayback()),
      { wrapper }
    );
    expect(result.current.albumItem).toBeTruthy();
    expect(result.current.albumItem?.title).toBe('Great Album');
  });

  it('returns null albumItem when no albumId', () => {
    const { result } = renderHook(
      () => useNowPlaying(makePlayback({ currentAlbumId: null })),
      { wrapper }
    );
    expect(result.current.albumItem).toBeNull();
  });

  it('passes through shuffle, repeat, volume, isExplicit', () => {
    const { result } = renderHook(
      () => useNowPlaying(makePlayback({ shuffle: true, repeat: 'all', volume: 75, isExplicit: true })),
      { wrapper }
    );
    expect(result.current.shuffle).toBe(true);
    expect(result.current.repeat).toBe('all');
    expect(result.current.volume).toBe(75);
    expect(result.current.isExplicit).toBe(true);
  });
});
