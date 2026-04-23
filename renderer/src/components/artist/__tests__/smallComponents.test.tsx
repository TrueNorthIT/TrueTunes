import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RadioCard } from '../RadioCard';
import { TopSongRow } from '../TopSongRow';
import { HeroTrackRow } from '../HeroTrackRow';
import { ArtistAlbumCard } from '../ArtistAlbumCard';
import { LatestReleaseCard } from '../LatestReleaseCard';
import type { SonosItem } from '../../../types/sonos';
import type { AlbumTrack } from '../../../hooks/useAlbumBrowse';

vi.mock('../../../hooks/useImage', () => ({ useImage: () => null }));

// ─── RadioCard ────────────────────────────────────────────────────────────────

describe('RadioCard', () => {
  const item: SonosItem = { title: 'Beatles Radio', type: 'ITEM_PLAYLIST' };

  it('renders Artist Radio label', () => {
    render(<RadioCard item={item} artUrl={null} onOpen={vi.fn()} />);
    expect(screen.getByText('Artist Radio')).toBeInTheDocument();
  });

  it('renders item title', () => {
    render(<RadioCard item={item} artUrl={null} onOpen={vi.fn()} />);
    expect(screen.getByText('Beatles Radio')).toBeInTheDocument();
  });

  it('calls onOpen when clicked', () => {
    const onOpen = vi.fn();
    render(<RadioCard item={item} artUrl={null} onOpen={onOpen} />);
    fireEvent.click(screen.getByText('Beatles Radio'));
    expect(onOpen).toHaveBeenCalledWith(item);
  });

  it('renders subtitle when present', () => {
    const withSub = { ...item, subtitle: 'Radio based on The Beatles' };
    render(<RadioCard item={withSub} artUrl={null} onOpen={vi.fn()} />);
    expect(screen.getByText('Radio based on The Beatles')).toBeInTheDocument();
  });

  it('renders art image when artUrl is set', () => {
    const { container } = render(<RadioCard item={item} artUrl="https://art.jpg" onOpen={vi.fn()} />);
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://art.jpg');
  });
});

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

describe('TopSongRow', () => {
  it('renders track title', () => {
    render(<TopSongRow track={makeAlbumTrack()} index={0} onAdd={vi.fn()} />);
    expect(screen.getByText('Come Together')).toBeInTheDocument();
  });

  it('renders 1-based index number', () => {
    render(<TopSongRow track={makeAlbumTrack()} index={2} onAdd={vi.fn()} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders formatted duration', () => {
    render(<TopSongRow track={makeAlbumTrack({ durationSeconds: 259 })} index={0} onAdd={vi.fn()} />);
    expect(screen.getByText('4:19')).toBeInTheDocument();
  });

  it('calls onAdd with raw item when + is clicked', () => {
    const onAdd = vi.fn();
    const raw = { name: 'CT', type: 'TRACK' } as SonosItem;
    render(<TopSongRow track={makeAlbumTrack({ raw })} index={0} onAdd={onAdd} />);
    fireEvent.click(screen.getByText('+'));
    expect(onAdd).toHaveBeenCalledWith(raw);
  });

  it('shows ExplicitBadge when explicit is true', () => {
    render(<TopSongRow track={makeAlbumTrack({ explicit: true })} index={0} onAdd={vi.fn()} />);
    expect(screen.getByTitle('Explicit')).toBeInTheDocument();
  });
});

// ─── HeroTrackRow ─────────────────────────────────────────────────────────────

// ─── ArtistAlbumCard ──────────────────────────────────────────────────────────

describe('ArtistAlbumCard', () => {
  const album: SonosItem = { title: 'Abbey Road', type: 'ITEM_ALBUM' };

  it('renders album title', () => {
    render(<ArtistAlbumCard album={album} onOpen={vi.fn()} />);
    expect(screen.getByText('Abbey Road')).toBeInTheDocument();
  });

  it('calls onOpen when clicked', () => {
    const onOpen = vi.fn();
    render(<ArtistAlbumCard album={album} onOpen={onOpen} />);
    fireEvent.click(screen.getByText('Abbey Road'));
    expect(onOpen).toHaveBeenCalledWith(album);
  });

  it('renders subtitle when present', () => {
    const withSub = { ...album, subtitle: '1969' };
    render(<ArtistAlbumCard album={withSub} onOpen={vi.fn()} />);
    expect(screen.getByText('1969')).toBeInTheDocument();
  });

  it('shows ExplicitBadge when isExplicit is true', () => {
    const explicit = { ...album, isExplicit: true };
    render(<ArtistAlbumCard album={explicit} onOpen={vi.fn()} />);
    expect(screen.getByTitle('Explicit')).toBeInTheDocument();
  });
});

// ─── LatestReleaseCard ────────────────────────────────────────────────────────

describe('LatestReleaseCard', () => {
  const album: SonosItem = { title: 'Now and Then', type: 'ITEM_ALBUM' };

  it('renders Latest Release label', () => {
    render(<LatestReleaseCard album={album} onOpen={vi.fn()} />);
    expect(screen.getByText('Latest Release')).toBeInTheDocument();
  });

  it('renders album title', () => {
    render(<LatestReleaseCard album={album} onOpen={vi.fn()} />);
    expect(screen.getByText('Now and Then')).toBeInTheDocument();
  });

  it('calls onOpen when clicked', () => {
    const onOpen = vi.fn();
    render(<LatestReleaseCard album={album} onOpen={onOpen} />);
    fireEvent.click(screen.getByText('Now and Then'));
    expect(onOpen).toHaveBeenCalledWith(album);
  });

  it('renders subtitle when present', () => {
    const withSub = { ...album, subtitle: 'Single' };
    render(<LatestReleaseCard album={withSub} onOpen={vi.fn()} />);
    expect(screen.getByText('Single')).toBeInTheDocument();
  });
});

import type { HeroTrack } from '../HeroTrackRow';

function makeHeroTrack(overrides: Partial<HeroTrack> = {}): HeroTrack {
  return {
    title: 'Hey Jude',
    durationSeconds: 431,
    artUrl: null,
    explicit: false,
    raw: { name: 'Hey Jude', type: 'TRACK' } as SonosItem,
    ...overrides,
  };
}

describe('HeroTrackRow', () => {
  it('renders track title', () => {
    render(
      <HeroTrackRow track={makeHeroTrack()} index={0} isSelected={false} onClick={vi.fn()} onDragStart={vi.fn()} onAdd={vi.fn()} />
    );
    expect(screen.getByText('Hey Jude')).toBeInTheDocument();
  });

  it('calls onClick when row is clicked', () => {
    const onClick = vi.fn();
    render(
      <HeroTrackRow track={makeHeroTrack()} index={3} isSelected={false} onClick={onClick} onDragStart={vi.fn()} onAdd={vi.fn()} />
    );
    fireEvent.click(screen.getByText('Hey Jude'));
    expect(onClick).toHaveBeenCalledWith(3, expect.any(Object));
  });

  it('calls onAdd when + button is clicked', () => {
    const onAdd = vi.fn();
    render(
      <HeroTrackRow track={makeHeroTrack()} index={0} isSelected={false} onClick={vi.fn()} onDragStart={vi.fn()} onAdd={onAdd} />
    );
    fireEvent.click(screen.getByText('+'));
    expect(onAdd).toHaveBeenCalled();
  });

  it('renders formatted duration', () => {
    render(
      <HeroTrackRow track={makeHeroTrack({ durationSeconds: 431 })} index={0} isSelected={false} onClick={vi.fn()} onDragStart={vi.fn()} onAdd={vi.fn()} />
    );
    expect(screen.getByText('7:11')).toBeInTheDocument();
  });

  it('shows ExplicitBadge when explicit is true', () => {
    render(
      <HeroTrackRow track={makeHeroTrack({ explicit: true })} index={0} isSelected={false} onClick={vi.fn()} onDragStart={vi.fn()} onAdd={vi.fn()} />
    );
    expect(screen.getByTitle('Explicit')).toBeInTheDocument();
  });
});
