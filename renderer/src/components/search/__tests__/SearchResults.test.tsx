import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchResults } from '../SearchResults';
import type { SonosItem } from '../../../types/sonos';

const mockOpenItem = vi.fn();
vi.mock('../../../hooks/useOpenItem', () => ({ useOpenItem: () => mockOpenItem }));
vi.mock('../../../hooks/useImage', () => ({ useImage: () => null }));
vi.mock('../../artist/ArtistHero', () => ({
  ArtistHero: ({ artist }: { artist: SonosItem }) => (
    <div data-testid="artist-hero">{String(artist.name ?? '')}</div>
  ),
}));
vi.mock('../ArtistCircle', () => ({
  ArtistCircle: ({ artist }: { artist: SonosItem }) => (
    <div data-testid="artist-circle">{String(artist.name ?? '')}</div>
  ),
}));

const onAddToQueue = vi.fn();

const makeTrack = (name: string, artistName?: string): SonosItem => ({
  type: 'TRACK',
  name,
  artists: artistName ? [{ name: artistName }] : [],
  id: { objectId: name, serviceId: 'gm', accountId: 'acc' },
  resource: { type: 'TRACK', id: { objectId: name, serviceId: 'gm', accountId: 'acc' } },
});

const makeArtist = (name: string): SonosItem => ({
  type: 'ARTIST',
  name,
  id: { objectId: name, serviceId: 'gm', accountId: 'acc' },
  resource: { type: 'ARTIST', id: { objectId: name, serviceId: 'gm', accountId: 'acc' } },
});

const makeAlbum = (name: string): SonosItem => ({
  type: 'ALBUM',
  name,
  id: { objectId: name, serviceId: 'gm', accountId: 'acc' },
  resource: { type: 'ALBUM', id: { objectId: name, serviceId: 'gm', accountId: 'acc' } },
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Empty results ────────────────────────────────────────────────────────────

describe('SearchResults — empty', () => {
  it('shows "No results." when results array is empty', () => {
    render(<SearchResults results={[]} onAddToQueue={onAddToQueue} />);
    expect(screen.getByText('No results.')).toBeInTheDocument();
  });
});

// ─── Result categorisation ───────────────────────────────────────────────────

describe('result categorisation', () => {
  it('renders tracks in the Songs section', () => {
    render(<SearchResults results={[makeTrack('Bohemian Rhapsody')]} onAddToQueue={onAddToQueue} />);
    expect(screen.getByText('Songs')).toBeInTheDocument();
    expect(screen.getByText('Bohemian Rhapsody')).toBeInTheDocument();
  });

  it('renders albums in the Albums section', () => {
    render(<SearchResults results={[makeAlbum('Dark Side of the Moon')]} onAddToQueue={onAddToQueue} />);
    expect(screen.getByText('Albums')).toBeInTheDocument();
    expect(screen.getByText('Dark Side of the Moon')).toBeInTheDocument();
  });

  it('renders the first artist as ArtistHero (not in Artists row)', () => {
    render(<SearchResults results={[makeArtist('Queen')]} onAddToQueue={onAddToQueue} />);
    expect(screen.getByTestId('artist-hero')).toHaveTextContent('Queen');
    expect(screen.queryByTestId('artist-circle')).toBeNull();
    expect(screen.queryByText('Artists')).toBeNull();
  });

  it('renders additional artists in the Artists row (not the first)', () => {
    const results = [makeArtist('Queen'), makeArtist('Led Zeppelin'), makeArtist('Pink Floyd')];
    render(<SearchResults results={results} onAddToQueue={onAddToQueue} />);
    expect(screen.getByTestId('artist-hero')).toHaveTextContent('Queen');
    const circles = screen.getAllByTestId('artist-circle');
    expect(circles).toHaveLength(2);
    expect(circles[0]).toHaveTextContent('Led Zeppelin');
    expect(circles[1]).toHaveTextContent('Pink Floyd');
  });

  it('does not render section headers for empty categories', () => {
    render(<SearchResults results={[makeTrack('Foo')]} onAddToQueue={onAddToQueue} />);
    expect(screen.queryByText('Albums')).toBeNull();
    expect(screen.queryByText('Artists')).toBeNull();
  });
});

// ─── Track selection ─────────────────────────────────────────────────────────

function getTrackRows(container: HTMLElement) {
  // MediaRow rows are divs with class "row" inside the tracks list
  return Array.from(container.querySelectorAll('.row'));
}

describe('track selection', () => {
  const tracks = [
    makeTrack('Track A'),
    makeTrack('Track B'),
    makeTrack('Track C'),
    makeTrack('Track D'),
    makeTrack('Track E'),
  ];

  it('selects a single track on click', () => {
    const { container } = render(<SearchResults results={tracks} onAddToQueue={onAddToQueue} />);
    const rows = getTrackRows(container);
    fireEvent.click(rows[1], { bubbles: true });
    expect(rows[1]).toHaveClass('selected');
    expect(rows[0]).not.toHaveClass('selected');
  });

  it('deselects the same track when clicked again', () => {
    const { container } = render(<SearchResults results={tracks} onAddToQueue={onAddToQueue} />);
    const rows = getTrackRows(container);
    fireEvent.click(rows[1], { bubbles: true });
    expect(rows[1]).toHaveClass('selected');
    fireEvent.click(rows[1], { bubbles: true });
    expect(rows[1]).not.toHaveClass('selected');
  });

  it('selects a range with shift+click', () => {
    const { container } = render(<SearchResults results={tracks} onAddToQueue={onAddToQueue} />);
    const rows = getTrackRows(container);
    // Select row 1 first
    fireEvent.click(rows[1], { bubbles: true });
    // Shift+click row 3 → should select rows 1, 2, 3
    fireEvent.click(rows[3], { shiftKey: true, bubbles: true });
    expect(rows[1]).toHaveClass('selected');
    expect(rows[2]).toHaveClass('selected');
    expect(rows[3]).toHaveClass('selected');
    expect(rows[0]).not.toHaveClass('selected');
    expect(rows[4]).not.toHaveClass('selected');
  });

  it('adds/removes individual tracks with ctrl+click', () => {
    const { container } = render(<SearchResults results={tracks} onAddToQueue={onAddToQueue} />);
    const rows = getTrackRows(container);
    // Select rows 0 and 2
    fireEvent.click(rows[0], { bubbles: true });
    fireEvent.click(rows[2], { ctrlKey: true, bubbles: true });
    expect(rows[0]).toHaveClass('selected');
    expect(rows[2]).toHaveClass('selected');
    // ctrl+click row 0 again → deselects it
    fireEvent.click(rows[0], { ctrlKey: true, bubbles: true });
    expect(rows[0]).not.toHaveClass('selected');
    expect(rows[2]).toHaveClass('selected');
  });

  it('clears selection when clicking the background of the tracks list', () => {
    const { container } = render(<SearchResults results={tracks} onAddToQueue={onAddToQueue} />);
    const rows = getTrackRows(container);
    fireEvent.click(rows[0], { bubbles: true });
    expect(rows[0]).toHaveClass('selected');

    // Click the tracksList container (parent of rows) — the stopPropagation in
    // the MediaRow onClick means this must be a direct click on the list, not a bubbled one.
    const list = container.querySelector('.tracksList') as HTMLElement;
    fireEvent.click(list);
    expect(rows[0]).not.toHaveClass('selected');
  });

  it('single click on a different track clears previous selection', () => {
    const { container } = render(<SearchResults results={tracks} onAddToQueue={onAddToQueue} />);
    const rows = getTrackRows(container);
    fireEvent.click(rows[0], { bubbles: true });
    fireEvent.click(rows[2], { bubbles: true });
    expect(rows[2]).toHaveClass('selected');
    expect(rows[0]).not.toHaveClass('selected');
  });
});

// ─── Drag behaviour ──────────────────────────────────────────────────────────

describe('drag behaviour', () => {
  const tracks = [makeTrack('Drag Me'), makeTrack('Second')];

  it('sets application/sonos-item-list data on drag', () => {
    const { container } = render(<SearchResults results={tracks} onAddToQueue={onAddToQueue} />);
    const row = getTrackRows(container)[0];

    const dt = {
      effectAllowed: '',
      setData: vi.fn(),
      setDragImage: vi.fn(),
      types: [] as string[],
    };
    fireEvent.dragStart(row, { dataTransfer: dt });

    expect(dt.setData).toHaveBeenCalledWith(
      'application/sonos-item-list',
      expect.stringContaining('Drag Me')
    );
  });

  it('drag data is JSON-parseable array', () => {
    const { container } = render(<SearchResults results={tracks} onAddToQueue={onAddToQueue} />);
    const row = getTrackRows(container)[0];

    let capturedData = '';
    const dt = { effectAllowed: '', setData: vi.fn((_, v) => { capturedData = v; }), setDragImage: vi.fn(), types: [] as string[] };
    fireEvent.dragStart(row, { dataTransfer: dt });

    const parsed = JSON.parse(capturedData) as unknown[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
  });
});
