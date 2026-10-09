import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AlbumTrackRow } from '../AlbumTrackRow';
import type { AlbumTrack } from '../../../hooks/useAlbumBrowse';
import type { SonosItem } from '../../../types/sonos';

vi.mock('../../../hooks/useImage', () => ({ useImage: () => null }));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));

function makeTrack(overrides: Partial<AlbumTrack> = {}): AlbumTrack {
  return {
    title: 'Come Together',
    ordinal: 3,
    durationSeconds: 259,
    artUrl: null,
    id: { objectId: 'trk-1', serviceId: 'svc', accountId: 'acc' },
    artists: ['The Beatles'],
    artistObjects: undefined,
    albumName: null,
    albumId: null,
    explicit: false,
    raw: { name: 'Come Together', type: 'TRACK' } as SonosItem,
    ...overrides,
  };
}

const baseProps = {
  isPlaylistOrProgram: false,
  isSelected: false,
  serviceId: 'svc',
  accountId: 'acc',
  onClick: vi.fn(),
  onDragStart: vi.fn(),
  onAdd: vi.fn(),
};

describe('AlbumTrackRow', () => {
  it('renders track title', () => {
    render(<AlbumTrackRow track={makeTrack()} {...baseProps} />);
    expect(screen.getByText('Come Together')).toBeInTheDocument();
  });

  it('renders ordinal number', () => {
    render(<AlbumTrackRow track={makeTrack()} {...baseProps} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders formatted duration', () => {
    render(<AlbumTrackRow track={makeTrack({ durationSeconds: 259 })} {...baseProps} />);
    expect(screen.getByText('4:19')).toBeInTheDocument();
  });

  it('calls onAdd when + is clicked', () => {
    const onAdd = vi.fn();
    render(<AlbumTrackRow track={makeTrack()} {...baseProps} onAdd={onAdd} />);
    fireEvent.click(screen.getByText('+'));
    expect(onAdd).toHaveBeenCalled();
  });

  it('calls onClick when row is clicked', () => {
    const onClick = vi.fn();
    render(<AlbumTrackRow track={makeTrack()} {...baseProps} onClick={onClick} />);
    fireEvent.click(screen.getByText('Come Together'));
    expect(onClick).toHaveBeenCalled();
  });

  it('renders artists as plain text for album (not playlist)', () => {
    render(<AlbumTrackRow track={makeTrack({ artists: ['John', 'Paul'] })} {...baseProps} />);
    expect(screen.getByText('John, Paul')).toBeInTheDocument();
  });

  it('shows ExplicitBadge when explicit', () => {
    render(<AlbumTrackRow track={makeTrack({ explicit: true })} {...baseProps} />);
    expect(screen.getByTitle('Explicit')).toBeInTheDocument();
  });

  describe('isPlaylistOrProgram=true', () => {
    const playlistProps = { ...baseProps, isPlaylistOrProgram: true };

    it('renders artist buttons with navigation', () => {
      render(<AlbumTrackRow
        track={makeTrack({ artistObjects: [{ name: 'John Lennon', objectId: 'art-j' }] })}
        {...playlistProps}
      />);
      const btn = screen.getByRole('button', { name: 'John Lennon' });
      fireEvent.click(btn);
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.stringMatching(/^\/artist\//),
        expect.anything()
      );
    });

    it('renders album link with navigation when albumId and albumName are set', () => {
      render(<AlbumTrackRow
        track={makeTrack({ albumId: 'alb-1', albumName: 'Abbey Road' })}
        {...playlistProps}
      />);
      const btn = screen.getByRole('button', { name: 'Abbey Road' });
      fireEvent.click(btn);
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.stringMatching(/^\/album\//),
        expect.anything()
      );
    });

    it('renders albumName as plain text when no albumId', () => {
      render(<AlbumTrackRow
        track={makeTrack({ albumId: null, albumName: 'Unknown Album' })}
        {...playlistProps}
      />);
      expect(screen.getByText('Unknown Album')).toBeInTheDocument();
    });
  });
});
