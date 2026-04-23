import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MiniPlayerShell } from '../MiniPlayer';

// Mock all the hooks that MiniPlayerShell pulls in
const mockUseNowPlaying = vi.fn();
vi.mock('../../hooks/useNowPlaying', () => ({ useNowPlaying: (...a: unknown[]) => mockUseNowPlaying(...a) }));
vi.mock('../../hooks/useAuth',    () => ({ useAuth: () => true }));
vi.mock('../../hooks/useGroups',  () => ({ useGroups: () => [] }));
vi.mock('../../hooks/usePlayback', () => ({
  usePlayback: () => ({
    playback: {
      isVisible: true, trackName: '', artistName: '', artUrl: null,
      stateIcon: '▶', timeLabel: '', progressPct: 0, durationMs: 0,
      isPlaying: false, shuffle: false, repeat: 'none', volume: 50,
      currentObjectId: null, currentServiceId: null, currentAccountId: null,
      currentAlbumId: null, currentAlbumName: null, isExplicit: false,
      queueId: null, queueVersion: null,
    },
  }),
}));

function makeNP(overrides: Record<string, unknown> = {}) {
  return {
    displayTrack: 'Test Track',
    displayArtist: 'Test Artist',
    cachedArt: null,
    dominantColor: null,
    progressPct: 50,
    isPlaying: false,
    elapsedLabel: '1:00',
    durationLabel: '3:00',
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
  vi.clearAllMocks();
  mockUseNowPlaying.mockReturnValue(makeNP());
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

  it('shows — when displayTrack is empty', () => {
    mockUseNowPlaying.mockReturnValue(makeNP({ displayTrack: '' }));
    render(<MiniPlayerShell />, { wrapper });
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
