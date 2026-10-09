import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ArtistCircle } from '../ArtistCircle';
import type { SonosItem } from '../../../types/sonos';

vi.mock('../../../hooks/useImage', () => ({ useImage: () => null }));

const artist: SonosItem = {
  name: 'The Beatles',
  type: 'ARTIST',
  resource: { type: 'ARTIST', id: { objectId: 'art-1' } },
};

describe('ArtistCircle', () => {
  it('renders the artist name', () => {
    render(<ArtistCircle artist={artist} onOpen={vi.fn()} />);
    expect(screen.getByText('The Beatles')).toBeInTheDocument();
  });

  it('calls onOpen with the artist item when clicked', () => {
    const onOpen = vi.fn();
    render(<ArtistCircle artist={artist} onOpen={onOpen} />);
    fireEvent.click(screen.getByText('The Beatles'));
    expect(onOpen).toHaveBeenCalledWith(artist);
  });

  it('shows first letter of name as placeholder when no art', () => {
    render(<ArtistCircle artist={artist} onOpen={vi.fn()} />);
    // placeholder shows the first letter
    expect(screen.getByText('T')).toBeInTheDocument();
  });

  it('uses title when no name', () => {
    const titled = { ...artist, name: undefined, title: 'Led Zeppelin' };
    render(<ArtistCircle artist={titled} onOpen={vi.fn()} />);
    expect(screen.getByText('Led Zeppelin')).toBeInTheDocument();
  });
});
