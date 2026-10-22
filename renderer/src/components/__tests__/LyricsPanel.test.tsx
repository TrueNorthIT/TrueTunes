import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LyricsPanel } from '../LyricsPanel';
import type { PlaybackState } from '../../hooks/usePlayback';

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../../hooks/useImage', () => ({ useImage: () => null }));
vi.mock('../../hooks/useOpenItem', () => ({ useOpenItem: () => vi.fn() }));
vi.mock('../../hooks/useResolveAndOpen', () => ({ useResolveAndOpen: () => ({ resolveAndOpen: vi.fn() }) }));
vi.mock('../../hooks/useGeniusDescription', () => ({ useGeniusDescription: () => ({ description: null }) }));

const mockQueuer = vi.fn();
vi.mock('../../hooks/useQueuer', () => ({ useQueuer: () => mockQueuer() }));

const mockNowPlaying = vi.fn();
vi.mock('../../hooks/useNowPlaying', () => ({ useNowPlaying: () => mockNowPlaying() }));

const mockUseLyrics = vi.fn();
vi.mock('../../hooks/useLyrics', async (orig) => ({
  ...(await orig<typeof import('../../hooks/useLyrics')>()),
  useLyrics: () => mockUseLyrics(),
}));

const playing = {
  displayTrack: 'Exo-Politics',
  displayArtist: 'Muse',
  albumName: 'Black Holes and Revelations',
  durationMs: 200_000,
  progressPct: 50,
  cachedArt: null,
  artUrlRaw: null,
  dominantColor: null,
  currentObjectId: 't1',
  albumItem: null,
  artistItem: null,
  prefetchAlbum: vi.fn(),
};
const noLyrics = { lines: [], plainLyrics: null, isLoading: false, isInstrumental: false, notFound: true };
const playback = {} as PlaybackState;

beforeEach(() => {
  vi.clearAllMocks();
  mockNowPlaying.mockReturnValue(playing);
  mockQueuer.mockReturnValue(null);
  mockUseLyrics.mockReturnValue(noLyrics);
});

describe('LyricsPanel', () => {
  it('heads the page with the playing track and links its artist and album', () => {
    render(<LyricsPanel playback={playback} />);
    expect(screen.getByRole('heading', { level: 1, name: /Exo-Politics/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Muse, open artist' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Black Holes and Revelations, open album' })).toBeInTheDocument();
  });

  it('marks the synced line that is playing now', () => {
    mockUseLyrics.mockReturnValue({
      ...noLyrics,
      notFound: false,
      lines: [{ timeMs: 0, text: 'First' }, { timeMs: 90_000, text: 'Now' }, { timeMs: 150_000, text: 'Later' }],
    });
    render(<LyricsPanel playback={playback} />);
    expect(screen.getByText('Now')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByText('Later')).not.toHaveAttribute('aria-current');
  });

  it('shows plain lyrics when there are no synced ones, instead of a blank page', () => {
    mockUseLyrics.mockReturnValue({ ...noLyrics, notFound: false, plainLyrics: 'Line one\n\nLine two' });
    render(<LyricsPanel playback={playback} />);
    expect(screen.getByText('Not synced to the song')).toBeInTheDocument();
    expect(screen.getByText('Line one')).toBeInTheDocument();
    expect(screen.getByText('Line two')).toBeInTheDocument();
  });

  it('says when no lyrics were found, and when the song is instrumental', () => {
    const { rerender } = render(<LyricsPanel playback={playback} />);
    expect(screen.getByText('No lyrics found for this song.')).toBeInTheDocument();
    mockUseLyrics.mockReturnValue({ ...noLyrics, notFound: false, isInstrumental: true });
    rerender(<LyricsPanel playback={playback} />);
    expect(screen.getByText('Instrumental, no lyrics to follow.')).toBeInTheDocument();
  });

  it('credits who queued it', () => {
    mockQueuer.mockReturnValue({ user: 'Aidan', imageUrl: null });
    render(<LyricsPanel playback={playback} />);
    expect(screen.getByRole('button', { name: 'Queued by Aidan, open profile' })).toBeInTheDocument();
  });

  it('says nothing is playing when there is no track', () => {
    mockNowPlaying.mockReturnValue({ ...playing, displayTrack: '' });
    render(<LyricsPanel playback={playback} />);
    expect(screen.getByRole('heading', { name: 'Nothing is playing' })).toBeInTheDocument();
  });
});
