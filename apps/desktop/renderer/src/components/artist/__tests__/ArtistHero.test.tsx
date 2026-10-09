import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArtistHero } from '../ArtistHero';
import type { SonosItem } from '../../../types/sonos';

const mockUseImage = vi.fn();
vi.mock('../../../hooks/useImage', () => ({ useImage: (...a: unknown[]) => mockUseImage(...a) }));

const mockUseDominantColor = vi.fn();
vi.mock('../../../hooks/useDominantColor', () => ({ useDominantColor: (...a: unknown[]) => mockUseDominantColor(...a) }));

const QUERY_KEY = ['artist-hero-test'];
vi.mock('../../../hooks/useArtistBrowse', () => ({
  artistQueryOptions: vi.fn(() => ({
    queryKey: QUERY_KEY,
    queryFn: async () => null,
  })),
}));

vi.mock('../HeroTrackRow', () => ({
  HeroTrackRow: ({
    track,
    index,
    isSelected,
    onClick,
    onAdd,
  }: {
    track: { title: string };
    index: number;
    isSelected: boolean;
    onClick: (i: number, e: React.MouseEvent) => void;
    onAdd: () => void;
  }) => (
    <div
      data-testid={`track-${index}`}
      data-selected={isSelected}
      onClick={(e) => onClick(index, e)}
    >
      {track.title}
      <button onClick={(e) => { e.stopPropagation(); onAdd(); }}>Add</button>
    </div>
  ),
}));

function makeSong(title: string, idx: number) {
  return {
    title,
    id: { objectId: `obj-${idx}` },
    raw: { name: title, type: 'TRACK' } as SonosItem,
  };
}

const artistItem: SonosItem = {
  name: 'The Beatles',
  type: 'ARTIST',
  resource: {
    type: 'ARTIST',
    id: { objectId: 'art-1', serviceId: 'svc-1', accountId: 'acc-1' },
  },
} as SonosItem;

function makeWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

function makeClient(topSongs?: ReturnType<typeof makeSong>[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (topSongs) {
    qc.setQueryData(QUERY_KEY, { topSongs });
  }
  return qc;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseImage.mockReturnValue(null);
  mockUseDominantColor.mockReturnValue(null);
});

describe('ArtistHero', () => {
  // ── basic rendering ──────────────────────────────────────────────────────────

  it('renders artist name', () => {
    render(
      <ArtistHero artist={artistItem} onAddToQueue={vi.fn()} onOpen={vi.fn()} />,
      { wrapper: makeWrapper(makeClient()) }
    );
    expect(screen.getByText('The Beatles')).toBeInTheDocument();
  });

  it('shows 6 placeholder rows when no data is loaded', () => {
    const { container } = render(
      <ArtistHero artist={artistItem} onAddToQueue={vi.fn()} onOpen={vi.fn()} />,
      { wrapper: makeWrapper(makeClient()) }
    );
    expect(container.querySelectorAll('[class*="heroTrackPh"]').length).toBe(6);
  });

  it('shows art image when useImage returns a URL', () => {
    mockUseImage.mockReturnValue('http://img.com/art.jpg');
    const { container } = render(
      <ArtistHero artist={artistItem} onAddToQueue={vi.fn()} onOpen={vi.fn()} />,
      { wrapper: makeWrapper(makeClient()) }
    );
    expect(container.querySelector('img[src="http://img.com/art.jpg"]')).toBeTruthy();
  });

  it('applies gradient style when dominant color is set', () => {
    mockUseDominantColor.mockReturnValue('200, 100, 50');
    const { container } = render(
      <ArtistHero artist={artistItem} onAddToQueue={vi.fn()} onOpen={vi.fn()} />,
      { wrapper: makeWrapper(makeClient()) }
    );
    const hero = container.querySelector('[class*="artistHero"]') as HTMLElement;
    expect(hero?.style.background).toContain('200, 100, 50');
  });

  // ── header interactions ───────────────────────────────────────────────────────

  it('calls onOpen when header is clicked', async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(
      <ArtistHero artist={artistItem} onAddToQueue={vi.fn()} onOpen={onOpen} />,
      { wrapper: makeWrapper(makeClient()) }
    );
    await user.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledWith(artistItem);
  });

  it('calls onOpen when Enter is pressed on hero header', async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(
      <ArtistHero artist={artistItem} onAddToQueue={vi.fn()} onOpen={onOpen} />,
      { wrapper: makeWrapper(makeClient()) }
    );
    screen.getByRole('button').focus();
    await user.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalled();
  });

  // ── track rendering ───────────────────────────────────────────────────────────

  it('renders tracks when data has topSongs', () => {
    const songs = [makeSong('Come Together', 0), makeSong('Let It Be', 1)];
    render(
      <ArtistHero artist={artistItem} onAddToQueue={vi.fn()} onOpen={vi.fn()} />,
      { wrapper: makeWrapper(makeClient(songs)) }
    );
    expect(screen.getByText('Come Together')).toBeInTheDocument();
    expect(screen.getByText('Let It Be')).toBeInTheDocument();
  });

  it('renders at most 6 tracks even when data has more', () => {
    const songs = Array.from({ length: 8 }, (_, i) => makeSong(`Song ${i + 1}`, i));
    render(
      <ArtistHero artist={artistItem} onAddToQueue={vi.fn()} onOpen={vi.fn()} />,
      { wrapper: makeWrapper(makeClient(songs)) }
    );
    expect(screen.queryByText('Song 7')).not.toBeInTheDocument();
    expect(screen.getByText('Song 6')).toBeInTheDocument();
  });

  it('calls onAddToQueue when Add button is clicked on a track', () => {
    const onAddToQueue = vi.fn();
    const songs = [makeSong('Come Together', 0)];
    render(
      <ArtistHero artist={artistItem} onAddToQueue={onAddToQueue} onOpen={vi.fn()} />,
      { wrapper: makeWrapper(makeClient(songs)) }
    );
    fireEvent.click(screen.getByText('Add'));
    expect(onAddToQueue).toHaveBeenCalledWith(songs[0].raw);
  });

  // ── track selection ───────────────────────────────────────────────────────────

  it('single-clicking a track selects it', () => {
    const songs = [makeSong('Song A', 0), makeSong('Song B', 1)];
    render(
      <ArtistHero artist={artistItem} onAddToQueue={vi.fn()} onOpen={vi.fn()} />,
      { wrapper: makeWrapper(makeClient(songs)) }
    );
    fireEvent.click(screen.getByTestId('track-0'));
    expect(screen.getByTestId('track-0')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('track-1')).toHaveAttribute('data-selected', 'false');
  });

  it('clicking a selected track deselects it', () => {
    const songs = [makeSong('Song A', 0)];
    render(
      <ArtistHero artist={artistItem} onAddToQueue={vi.fn()} onOpen={vi.fn()} />,
      { wrapper: makeWrapper(makeClient(songs)) }
    );
    fireEvent.click(screen.getByTestId('track-0'));
    expect(screen.getByTestId('track-0')).toHaveAttribute('data-selected', 'true');
    fireEvent.click(screen.getByTestId('track-0'));
    expect(screen.getByTestId('track-0')).toHaveAttribute('data-selected', 'false');
  });

  it('ctrl+click toggles an additional track into selection', () => {
    const songs = [makeSong('Song A', 0), makeSong('Song B', 1)];
    render(
      <ArtistHero artist={artistItem} onAddToQueue={vi.fn()} onOpen={vi.fn()} />,
      { wrapper: makeWrapper(makeClient(songs)) }
    );
    fireEvent.click(screen.getByTestId('track-0'));
    fireEvent.click(screen.getByTestId('track-1'), { ctrlKey: true });
    expect(screen.getByTestId('track-0')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('track-1')).toHaveAttribute('data-selected', 'true');
  });

  it('ctrl+click on a selected track deselects it', () => {
    const songs = [makeSong('Song A', 0), makeSong('Song B', 1)];
    render(
      <ArtistHero artist={artistItem} onAddToQueue={vi.fn()} onOpen={vi.fn()} />,
      { wrapper: makeWrapper(makeClient(songs)) }
    );
    fireEvent.click(screen.getByTestId('track-0'));
    fireEvent.click(screen.getByTestId('track-1'), { ctrlKey: true });
    fireEvent.click(screen.getByTestId('track-0'), { ctrlKey: true });
    expect(screen.getByTestId('track-0')).toHaveAttribute('data-selected', 'false');
    expect(screen.getByTestId('track-1')).toHaveAttribute('data-selected', 'true');
  });

  it('shift+click range-selects from last clicked to target', () => {
    const songs = Array.from({ length: 5 }, (_, i) => makeSong(`Song ${i}`, i));
    render(
      <ArtistHero artist={artistItem} onAddToQueue={vi.fn()} onOpen={vi.fn()} />,
      { wrapper: makeWrapper(makeClient(songs)) }
    );
    fireEvent.click(screen.getByTestId('track-1'));
    fireEvent.click(screen.getByTestId('track-3'), { shiftKey: true });
    expect(screen.getByTestId('track-1')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('track-2')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('track-3')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('track-0')).toHaveAttribute('data-selected', 'false');
    expect(screen.getByTestId('track-4')).toHaveAttribute('data-selected', 'false');
  });

  it('clicking the outer div clears selection', () => {
    const songs = [makeSong('Song A', 0)];
    const { container } = render(
      <ArtistHero artist={artistItem} onAddToQueue={vi.fn()} onOpen={vi.fn()} />,
      { wrapper: makeWrapper(makeClient(songs)) }
    );
    fireEvent.click(screen.getByTestId('track-0'));
    expect(screen.getByTestId('track-0')).toHaveAttribute('data-selected', 'true');
    // Click the outer hero div (not the track or header)
    fireEvent.click(container.querySelector('[class*="artistHero"]')!);
    expect(screen.getByTestId('track-0')).toHaveAttribute('data-selected', 'false');
  });
});
