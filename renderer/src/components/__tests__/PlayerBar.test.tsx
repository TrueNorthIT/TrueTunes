import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PlayerBar } from '../PlayerBar';
import type { PlaybackState } from '../../hooks/usePlayback';

// ─── module mocks ────────────────────────────────────────────────────────────

vi.mock('../../hooks/useNowPlaying', () => ({
  useNowPlaying: vi.fn(),
}));

vi.mock('../../hooks/useOpenItem', () => ({
  useOpenItem: () => vi.fn(),
}));

import { useNowPlaying } from '../../hooks/useNowPlaying';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makePlayback(overrides: Partial<PlaybackState> = {}): PlaybackState {
  return {
    isVisible: true,
    trackName: 'Test Track',
    artistName: 'Test Artist',
    artUrl: null,
    stateIcon: '▶',
    timeLabel: '1:00 / 3:00',
    progressPct: 33,
    durationMs: 180000,
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

function makeNowPlaying(overrides: Partial<ReturnType<typeof useNowPlaying>> = {}) {
  return {
    displayTrack: 'Test Track',
    displayArtist: 'Test Artist',
    albumName: null,
    albumId: null,
    cachedArt: null,
    dominantColor: null,
    elapsedLabel: '1:00',
    durationLabel: '3:00',
    progressPct: 33,
    durationMs: 180000,
    isPlaying: true,
    isVisible: true,
    shuffle: false,
    repeat: 'none' as const,
    volume: 50,
    isExplicit: false,
    albumItem: null,
    prefetchAlbum: vi.fn(),
    ...overrides,
  };
}

function setup(
  playbackOverrides: Partial<PlaybackState> = {},
  nowPlayingOverrides: Partial<ReturnType<typeof useNowPlaying>> = {},
  extraProps: { isAuthed?: boolean; onToggleQueue?: () => void; onShuffle?: () => void } = {}
) {
  vi.mocked(useNowPlaying).mockReturnValue(makeNowPlaying(nowPlayingOverrides) as ReturnType<typeof useNowPlaying>);

  const user = userEvent.setup();
  const props = {
    isAuthed: true,
    playback: makePlayback(playbackOverrides),
    onToggleQueue: vi.fn(),
    onShuffle: vi.fn(),
    ...extraProps,
  };
  const qc = new QueryClient();
  const result = render(
    <QueryClientProvider client={qc}>
      <PlayerBar {...props} />
    </QueryClientProvider>
  );
  return { user, props, ...result };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(window.sonos.fetch).mockResolvedValue({ data: null });
  vi.mocked(window.sonos.refreshPlayback).mockResolvedValue(undefined);
  vi.mocked(window.sonos.play).mockResolvedValue(undefined);
  vi.mocked(window.sonos.pause).mockResolvedValue(undefined);
  vi.mocked(window.sonos.skipNext).mockResolvedValue(undefined);
  vi.mocked(window.sonos.skipPrev).mockResolvedValue(undefined);
  vi.mocked(window.sonos.setPlayModes).mockResolvedValue(undefined);
  vi.mocked(window.sonos.setGroupVolume).mockResolvedValue(undefined);
  vi.mocked(window.sonos.openMiniPlayer).mockResolvedValue(undefined);
});

// ─── visibility ───────────────────────────────────────────────────────────────

describe('PlayerBar — visibility', () => {
  it('renders nothing visible when isVisible is false', () => {
    vi.mocked(useNowPlaying).mockReturnValue(
      makeNowPlaying({ isVisible: false }) as ReturnType<typeof useNowPlaying>
    );
    const qc = new QueryClient();
    const { container } = render(
      <QueryClientProvider client={qc}>
        <PlayerBar
          isAuthed={true}
          playback={makePlayback()}
          onToggleQueue={vi.fn()}
          onShuffle={vi.fn()}
        />
      </QueryClientProvider>
    );
    expect(container.querySelector('[class*="bar"]')).toBeNull();
  });

  it('renders the player bar when isVisible is true', () => {
    const { container } = setup();
    expect(container.querySelector('[class*="bar"]')).toBeTruthy();
  });
});

// ─── track info ───────────────────────────────────────────────────────────────

describe('PlayerBar — track info', () => {
  it('displays track and artist name', () => {
    setup();
    expect(screen.getByText('Test Track - Test Artist')).toBeInTheDocument();
  });

  it('shows elapsed and duration labels', () => {
    setup();
    expect(screen.getByText('1:00')).toBeInTheDocument();
    expect(screen.getByText('3:00')).toBeInTheDocument();
  });

  it('shows art image when cachedArt is set', () => {
    const { container } = setup({}, { cachedArt: 'https://example.com/art.jpg' });
    const img = container.querySelector('img[class*="art"]');
    expect(img).toHaveAttribute('src', 'https://example.com/art.jpg');
  });

  it('shows music placeholder when no art', () => {
    const { container } = setup({}, { cachedArt: null });
    expect(container.querySelector('[class*="artPh"]')).toBeTruthy();
  });
});

// ─── transport: play/pause ────────────────────────────────────────────────────

describe('PlayerBar — play/pause', () => {
  it('clicking play/pause while playing calls pause then refresh', async () => {
    const { user, container } = setup({ isPlaying: true }, { isPlaying: true });
    const playBtn = container.querySelector('[class*="playBtn"]') as HTMLElement;
    await user.click(playBtn);
    await waitFor(() => expect(window.sonos.pause).toHaveBeenCalled());
    expect(window.sonos.refreshPlayback).toHaveBeenCalled();
  });

  it('clicking play/pause while paused calls play then refresh', async () => {
    const { user, container } = setup({ isPlaying: false }, { isPlaying: false });
    const playBtn = container.querySelector('[class*="playBtn"]') as HTMLElement;
    await user.click(playBtn);
    await waitFor(() => expect(window.sonos.play).toHaveBeenCalled());
    expect(window.sonos.refreshPlayback).toHaveBeenCalled();
  });
});

// ─── transport: skip ──────────────────────────────────────────────────────────

describe('PlayerBar — skip', () => {
  it('clicking Previous calls skipPrev then refresh', async () => {
    const { user } = setup();
    await user.click(screen.getByTitle('Previous'));
    await waitFor(() => expect(window.sonos.skipPrev).toHaveBeenCalled());
    expect(window.sonos.refreshPlayback).toHaveBeenCalled();
  });

  it('clicking Next calls skipNext then refresh', async () => {
    const { user } = setup();
    await user.click(screen.getByTitle('Next'));
    await waitFor(() => expect(window.sonos.skipNext).toHaveBeenCalled());
    expect(window.sonos.refreshPlayback).toHaveBeenCalled();
  });
});

// ─── transport: shuffle ───────────────────────────────────────────────────────

describe('PlayerBar — shuffle', () => {
  it('clicking Shuffle calls setPlayModes with toggled value', async () => {
    const { user } = setup({ shuffle: false });
    await user.click(screen.getByTitle('Shuffle'));
    await waitFor(() =>
      expect(window.sonos.setPlayModes).toHaveBeenCalledWith({ shuffle: true })
    );
  });

  it('toggling shuffle off calls setPlayModes with false', async () => {
    const { user } = setup({ shuffle: true });
    await user.click(screen.getByTitle('Shuffle'));
    await waitFor(() =>
      expect(window.sonos.setPlayModes).toHaveBeenCalledWith({ shuffle: false })
    );
  });

  it('shuffle button calls onShuffle prop', async () => {
    const onShuffle = vi.fn();
    const { user } = setup({}, {}, { onShuffle });
    await user.click(screen.getByTitle('Shuffle'));
    await waitFor(() => expect(onShuffle).toHaveBeenCalled());
  });
});

// ─── transport: repeat ────────────────────────────────────────────────────────

describe('PlayerBar — repeat', () => {
  it('clicking Repeat when off sets to all', async () => {
    const { user } = setup({ repeat: 'none' });
    await user.click(screen.getByTitle('Repeat off'));
    await waitFor(() =>
      expect(window.sonos.setPlayModes).toHaveBeenCalledWith({ repeat: true, repeatOne: false })
    );
  });

  it('clicking Repeat when all sets to one', async () => {
    const { user } = setup({ repeat: 'all' }, { repeat: 'all' });
    await user.click(screen.getByTitle('Repeat all'));
    await waitFor(() =>
      expect(window.sonos.setPlayModes).toHaveBeenCalledWith({ repeat: false, repeatOne: true })
    );
  });

  it('clicking Repeat when one sets to none', async () => {
    const { user } = setup({ repeat: 'one' }, { repeat: 'one' });
    await user.click(screen.getByTitle('Repeat one'));
    await waitFor(() =>
      expect(window.sonos.setPlayModes).toHaveBeenCalledWith({ repeat: false, repeatOne: false })
    );
  });
});

// ─── seek bar ────────────────────────────────────────────────────────────────

describe('PlayerBar — seek bar', () => {
  it('clicking seek bar at 50% calls seek with half of durationMs', async () => {
    setup({}, { durationMs: 200000 });
    const bar = screen.getByRole('progressbar');
    // Simulate a click at 50% of the bar
    Object.defineProperty(bar, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 200, top: 0, height: 4, right: 200, bottom: 4 }),
    });
    act(() => {
      bar.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 100 }));
    });
    await waitFor(() =>
      expect(window.sonos.fetch).toHaveBeenCalledWith(
        expect.objectContaining({ operationId: 'seek', body: { positionMillis: 100000 } })
      )
    );
    expect(window.sonos.refreshPlayback).toHaveBeenCalled();
  });

  it('clicking at 0% seeks to 0', async () => {
    setup({}, { durationMs: 100000 });
    const bar = screen.getByRole('progressbar');
    Object.defineProperty(bar, 'getBoundingClientRect', {
      value: () => ({ left: 50, width: 100, top: 0, height: 4, right: 150, bottom: 4 }),
    });
    act(() => {
      bar.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 50 }));
    });
    await waitFor(() =>
      expect(window.sonos.fetch).toHaveBeenCalledWith(
        expect.objectContaining({ body: { positionMillis: 0 } })
      )
    );
  });

  it('does not seek when durationMs is 0', async () => {
    setup({}, { durationMs: 0 });
    const bar = screen.getByRole('progressbar');
    Object.defineProperty(bar, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 200, top: 0, height: 4, right: 200, bottom: 4 }),
    });
    act(() => {
      bar.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 100 }));
    });
    expect(window.sonos.fetch).not.toHaveBeenCalled();
  });
});

// ─── volume ───────────────────────────────────────────────────────────────────

describe('PlayerBar — volume button', () => {
  it('clicking Volume button shows the popover', async () => {
    const { user } = setup();
    await user.click(screen.getByTitle('Volume'));
    expect(screen.getByRole('slider')).toBeInTheDocument();
  });

  it('clicking outside volume popover closes it', async () => {
    const { user } = setup();
    await user.click(screen.getByTitle('Volume'));
    expect(screen.getByRole('slider')).toBeInTheDocument();
    await user.click(document.body);
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it('shows current volume percentage in popover', async () => {
    const { user } = setup({ volume: 72 }, { volume: 72 });
    await user.click(screen.getByTitle('Volume'));
    expect(screen.getByText('72')).toBeInTheDocument();
  });
});

// ─── right-side controls ─────────────────────────────────────────────────────

describe('PlayerBar — right controls', () => {
  it('Queue button calls onToggleQueue', async () => {
    const onToggleQueue = vi.fn();
    const { user } = setup({}, {}, { onToggleQueue });
    await user.click(screen.getByTitle('Queue'));
    expect(onToggleQueue).toHaveBeenCalled();
  });

  it('Mini player button calls openMiniPlayer', async () => {
    const { user } = setup();
    await user.click(screen.getByTitle('Mini player'));
    expect(window.sonos.openMiniPlayer).toHaveBeenCalled();
  });
});

// ─── disabled when not authed ─────────────────────────────────────────────────

describe('PlayerBar — disabled state', () => {
  it('transport buttons are disabled when not authed', () => {
    setup({}, {}, { isAuthed: false });
    expect(screen.getByTitle('Shuffle')).toBeDisabled();
    expect(screen.getByTitle('Previous')).toBeDisabled();
    expect(screen.getByTitle('Next')).toBeDisabled();
  });
});
