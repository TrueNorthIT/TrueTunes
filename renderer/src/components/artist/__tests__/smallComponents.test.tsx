import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TopSongRow } from '../TopSongRow';
import { ArtistAlbumCard } from '../ArtistAlbumCard';
import { LatestReleaseCard } from '../LatestReleaseCard';
import type { SonosItem } from '../../../types/sonos';
import type { AlbumTrack } from '../../../hooks/useAlbumBrowse';

vi.mock('../../../hooks/useImage', () => ({ useImage: () => null }));

// ─── TopSongRow ───────────────────────────────────────────────────────────────

function makeAlbumTrack(overrides: Partial<AlbumTrack> = {}): AlbumTrack {
  return {
    title: 'Come Together',
    ordinal: 1,
    durationSeconds: 259,
    artUrl: null,
    id: { objectId: 'trk-1', serviceId: 'svc', accountId: 'acc' },
    artists: ['The Beatles'],
    albumName: 'Abbey Road',
    albumId: 'alb-1',
    explicit: false,
    raw: { name: 'Come Together', type: 'TRACK' } as SonosItem,
    ...overrides,
  };
}

const rowProps = { onOpenAlbum: vi.fn(), onOpenArtist: vi.fn() };
const inList = (ui: React.ReactElement) => render(<ol>{ui}</ol>);

describe('TopSongRow', () => {
  it('renders track title', () => {
    inList(<TopSongRow track={makeAlbumTrack()} index={0} isSelected={false} onAdd={vi.fn()} onClick={vi.fn()} onDragStart={vi.fn()} {...rowProps} />);
    expect(screen.getByText('Come Together')).toBeInTheDocument();
  });

  it('renders 1-based index number', () => {
    inList(<TopSongRow track={makeAlbumTrack()} index={2} isSelected={false} onAdd={vi.fn()} onClick={vi.fn()} onDragStart={vi.fn()} {...rowProps} />);
    expect(screen.getByText('03')).toBeInTheDocument();
  });

  it('renders formatted duration', () => {
    inList(<TopSongRow track={makeAlbumTrack({ durationSeconds: 259 })} index={0} isSelected={false} onAdd={vi.fn()} onClick={vi.fn()} onDragStart={vi.fn()} {...rowProps} />);
    expect(screen.getByText('4:19')).toBeInTheDocument();
  });

  it('calls onAdd with raw item when + is clicked', () => {
    const onAdd = vi.fn();
    const raw = { name: 'CT', type: 'TRACK' } as SonosItem;
    inList(<TopSongRow track={makeAlbumTrack({ raw })} index={0} isSelected={false} onAdd={onAdd} onClick={vi.fn()} onDragStart={vi.fn()} {...rowProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Come Together to queue' }));
    expect(onAdd).toHaveBeenCalledWith(raw);
  });

  it('opens the album from the title and a collaborator from the artist cell', () => {
    const onOpenAlbum = vi.fn();
    const onOpenArtist = vi.fn();
    const track = makeAlbumTrack({ artists: ['The Beatles', 'Billy Preston'] });
    inList(<TopSongRow track={track} index={0} isSelected={false} artistName="The Beatles" onAdd={vi.fn()} onClick={vi.fn()} onDragStart={vi.fn()} onOpenAlbum={onOpenAlbum} onOpenArtist={onOpenArtist} />);
    fireEvent.click(screen.getByRole('button', { name: 'Come Together, open album' }));
    expect(onOpenAlbum).toHaveBeenCalledWith(track);
    expect(screen.queryByRole('button', { name: 'The Beatles, open artist' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Billy Preston, open artist' }));
    expect(onOpenArtist).toHaveBeenCalledWith('Billy Preston');
  });

  it('swaps the rank for the now-playing indicator on the current track', () => {
    inList(<TopSongRow track={makeAlbumTrack()} index={0} isSelected={false} isCurrentTrack isPlaybackActive onAdd={vi.fn()} onClick={vi.fn()} onDragStart={vi.fn()} {...rowProps} />);
    expect(screen.getByRole('img', { name: 'Now playing' })).toBeInTheDocument();
    expect(screen.queryByText('01')).not.toBeInTheDocument();
  });

  it('shows ExplicitBadge when explicit is true', () => {
    inList(<TopSongRow track={makeAlbumTrack({ explicit: true })} index={0} isSelected={false} onAdd={vi.fn()} onClick={vi.fn()} onDragStart={vi.fn()} {...rowProps} />);
    expect(screen.getByTitle('Explicit')).toBeInTheDocument();
  });
});

// ─── ArtistAlbumCard ──────────────────────────────────────────────────────────

describe('ArtistAlbumCard', () => {
  const album: SonosItem = { title: 'Abbey Road', type: 'ITEM_ALBUM' };

  it('renders album title', () => {
    render(<ArtistAlbumCard album={album} onOpen={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByText('Abbey Road')).toBeInTheDocument();
  });

  it('calls onOpen when clicked', () => {
    const onOpen = vi.fn();
    render(<ArtistAlbumCard album={album} onOpen={onOpen} onAdd={vi.fn()} />);
    fireEvent.click(screen.getByText('Abbey Road'));
    expect(onOpen).toHaveBeenCalledWith(album);
  });

  it('renders subtitle when present', () => {
    const withSub = { ...album, subtitle: '1969' };
    render(<ArtistAlbumCard album={withSub} onOpen={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByText('1969')).toBeInTheDocument();
  });

  it('shows ExplicitBadge when isExplicit is true', () => {
    const explicit = { ...album, isExplicit: true };
    render(<ArtistAlbumCard album={explicit} onOpen={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByTitle('Explicit')).toBeInTheDocument();
  });
});

// ─── LatestReleaseCard ────────────────────────────────────────────────────────

describe('LatestReleaseCard', () => {
  const album: SonosItem = { title: 'Now and Then', type: 'ITEM_ALBUM' };

  it('renders the Latest release label', () => {
    render(<LatestReleaseCard album={album} onOpen={vi.fn()} />);
    expect(screen.getByText('Latest release')).toBeInTheDocument();
  });

  it('puts the year on the label', () => {
    render(<LatestReleaseCard album={album} onOpen={vi.fn()} year={2023} />);
    expect(screen.getByText('Latest release · 2023')).toBeInTheDocument();
  });

  it('renders album title', () => {
    render(<LatestReleaseCard album={album} onOpen={vi.fn()} />);
    expect(screen.getByText('Now and Then')).toBeInTheDocument();
  });

  it('calls onOpen when clicked', () => {
    const onOpen = vi.fn();
    render(<LatestReleaseCard album={album} onOpen={onOpen} />);
    // the caption text is click-through (pointer-events: none); the card's open button sits under it
    fireEvent.click(screen.getByRole('button', { name: 'Open Now and Then' }));
    expect(onOpen).toHaveBeenCalledWith(album);
  });

  it('renders subtitle when present', () => {
    const withSub = { ...album, subtitle: 'Single' };
    render(<LatestReleaseCard album={withSub} onOpen={vi.fn()} />);
    expect(screen.getByText('Single')).toBeInTheDocument();
  });
});
