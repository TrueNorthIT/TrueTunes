import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MiniPlayerShell } from '../MiniPlayer';

// Mock all the hooks that MiniPlayerShell pulls in
const mockUseNowPlaying = vi.fn();
import { setPlaybackPosition } from '../../hooks/playbackPosition';
vi.mock('../../hooks/useNowPlaying', () => ({ useNowPlaying: (...a: unknown[]) => mockUseNowPlaying(...a) }));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => true }));
vi.mock('../../hooks/useGroups', () => ({ useGroups: () => [] }));
const mockUseQueuer = vi.fn();
vi.mock('../../hooks/useQueuer', () => ({ useQueuer: (...a: unknown[]) => mockUseQueuer(...a) }));
vi.mock('../../hooks/usePlayback', () => ({
  usePlayback: () => ({
    playback: {
      isVisible: true,
      trackName: '',
      artistName: '',
      artUrl: null,
      stateIcon: '▶',
      timeLabel: '',
      progressPct: 0,
      durationMs: 0,
      isPlaying: false,
      shuffle: false,
      repeat: 'none',
      volume: 50,
      currentObjectId: null,
      currentServiceId: null,
      currentAccountId: null,
      currentAlbumId: null,
      currentAlbumName: null,
      isExplicit: false,
      queueId: null,
      queueVersion: null,
    },
  }),
}));

function makeNP(overrides: Record<string, unknown> = {}) {
  return {
    displayTrack: 'Test Track',
    displayArtist: 'Test Artist',
    cachedArt: null,
    dominantColor: null,
    isPlaying: false,
    durationMs: 180000,
    isVisible: true,
    shuffle: false,
    repeat: 'none',
    volume: 50,
    isExplicit: false,
    albumItem: null,
    prefetchAlbum: vi.fn(),
    ...overrides,
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  return createElement(QueryClientProvider, { client: new QueryClient() }, children);
}

beforeEach(() => {
  setPlaybackPosition({
    trackEndsAtMs: 0,
    positionMs: 90000,
    durationMs: 180000,
    progressPct: 50,
    timeLabel: '1:30 / 3:00',
  });
  vi.clearAllMocks();
  mockUseNowPlaying.mockReturnValue(makeNP());
  mockUseQueuer.mockReturnValue(null);
  vi.mocked(window.sonos.skipPrev).mockResolvedValue(undefined);
  vi.mocked(window.sonos.skipNext).mockResolvedValue(undefined);
  vi.mocked(window.sonos.play).mockResolvedValue(undefined);
  vi.mocked(window.sonos.pause).mockResolvedValue(undefined);
  vi.mocked(window.sonos.refreshPlayback).mockResolvedValue(undefined);
  vi.mocked(window.sonos.closeMiniPlayer).mockResolvedValue(undefined);
});

describe('MiniPlayerShell', () => {
  it('renders track name', () => {
    render(<MiniPlayerShell />, { wrapper });
    expect(screen.getByText('Test Track')).toBeInTheDocument();
  });

  it('renders artist name', () => {
    render(<MiniPlayerShell />, { wrapper });
    expect(screen.getByText('Test Artist')).toBeInTheDocument();
  });

  it('renders placeholder when no art', () => {
    const { container } = render(<MiniPlayerShell />, { wrapper });
    expect(container.querySelector('[class*="artPh"]')).toBeTruthy();
  });

  it('clicking Previous calls skipPrev then refreshPlayback', async () => {
    const user = userEvent.setup();
    render(<MiniPlayerShell />, { wrapper });
    await user.click(screen.getByTitle('Previous'));
    await waitFor(() => expect(window.sonos.skipPrev).toHaveBeenCalled());
    expect(window.sonos.refreshPlayback).toHaveBeenCalled();
  });

  it('clicking Next calls skipNext then refreshPlayback', async () => {
    const user = userEvent.setup();
    render(<MiniPlayerShell />, { wrapper });
    await user.click(screen.getByTitle('Next'));
    await waitFor(() => expect(window.sonos.skipNext).toHaveBeenCalled());
    expect(window.sonos.refreshPlayback).toHaveBeenCalled();
  });

  it('clicking Play calls play when not playing', async () => {
    mockUseNowPlaying.mockReturnValue(makeNP({ isPlaying: false }));
    const user = userEvent.setup();
    render(<MiniPlayerShell />, { wrapper });
    await user.click(screen.getByTitle('Play'));
    await waitFor(() => expect(window.sonos.play).toHaveBeenCalled());
  });

  it('clicking Pause calls pause when playing', async () => {
    mockUseNowPlaying.mockReturnValue(makeNP({ isPlaying: true }));
    const user = userEvent.setup();
    render(<MiniPlayerShell />, { wrapper });
    await user.click(screen.getByTitle('Pause'));
    await waitFor(() => expect(window.sonos.pause).toHaveBeenCalled());
  });

  it('clicking Close calls closeMiniPlayer', async () => {
    const user = userEvent.setup();
    render(<MiniPlayerShell />, { wrapper });
    await user.click(screen.getByTitle('Close'));
    expect(window.sonos.closeMiniPlayer).toHaveBeenCalled();
  });

  it('says nothing is playing when displayTrack is empty', () => {
    mockUseNowPlaying.mockReturnValue(makeNP({ displayTrack: '' }));
    render(<MiniPlayerShell />, { wrapper });
    expect(screen.getByText('Nothing playing')).toBeInTheDocument();
  });

  it('shows who queued the track', () => {
    mockUseQueuer.mockReturnValue({ user: 'Joe Pitts', imageUrl: null });
    render(<MiniPlayerShell />, { wrapper });
    expect(screen.getByText('Joe Pitts')).toBeInTheDocument();
    expect(screen.getByTitle('Queued by Joe Pitts')).toBeInTheDocument();
  });

  it('shows the time left, not elapsed and total', () => {
    // 50% of 3:00
    render(<MiniPlayerShell />, { wrapper });
    expect(screen.getByText('−1:30')).toBeInTheDocument();
    expect(screen.queryByText('3:00')).toBeNull();
  });

  it('keeps the transport showing while paused', () => {
    mockUseNowPlaying.mockReturnValue(makeNP({ isPlaying: false }));
    const { container, rerender } = render(<MiniPlayerShell />, { wrapper });
    expect(container.querySelector('[class*="paused"]')).toBeTruthy();
    mockUseNowPlaying.mockReturnValue(makeNP({ isPlaying: true }));
    rerender(<MiniPlayerShell />);
    expect(container.querySelector('[class*="paused"]')).toBeNull();
  });

  it('asks for the attribution map on open', () => {
    render(<MiniPlayerShell />, { wrapper });
    expect(window.sonos.refreshAttribution).toHaveBeenCalled();
  });
});
