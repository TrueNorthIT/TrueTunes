import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DjUpcomingRow } from '../DjUpcomingRow';

// The real hook resolves a cached blob URL asynchronously; echoing the input
// keeps the has-art / no-art branches distinguishable.
vi.mock('../../../hooks/useImage', () => ({
  useImage: (url: string | null) => url ?? null,
}));

const track = (over: Partial<DjTrack> = {}): DjTrack => ({
  uri: 'u1',
  trackName: 'Loser',
  artist: 'Tame Impala',
  imageUrl: 'https://example.test/loser.jpg',
  score: 0.5,
  because: 'Rich and Alex queue Tame Impala',
  ...over,
});

describe('DjUpcomingRow', () => {
  it('shows artwork, title, artist and the reason', () => {
    render(<DjUpcomingRow track={track()} idle={false} />);

    const img = screen.getByRole('presentation', { hidden: true }) as HTMLImageElement | null;
    expect(img ?? document.querySelector('img')).toBeTruthy();
    expect(screen.getByText('Loser')).toBeInTheDocument();
    expect(screen.getByText('Tame Impala')).toBeInTheDocument();
    expect(screen.getByText('Rich and Alex queue Tame Impala')).toBeInTheDocument();
  });

  it('REQ-W7: the DJ icon is the info trigger and explains the pick', async () => {
    render(
      <DjUpcomingRow
        track={track({ score: 0.7, fans: [{ user: 'Rich', count: 3 }, { user: 'Alex', count: 1 }] })}
        idle={false}
        viewer="Rich"
      />,
    );
    await userEvent.hover(screen.getByRole('button', { name: 'Why this pick' }));
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('You — queued them 3 times');
    expect(tip).toHaveTextContent('Alex — queued them once');
    expect(tip).toHaveTextContent("Good fit for who's in: 70%");
    expect(tip).toHaveTextContent("\"Loser\": one of the office's most-played songs by them.");
  });

  it('falls back to the note placeholder when a track has no art', () => {
    const { container } = render(<DjUpcomingRow track={track({ imageUrl: undefined })} idle={false} />);
    expect(container.querySelector('img')).toBeFalsy();
    expect(container.querySelector('.artPh')).toBeTruthy();
  });

  /**
   * Only the first of these is really in the Sonos queue, so offering to drag,
   * reorder or skip to them would be a lie.
   */
  it('is not draggable like a real queue row', () => {
    const { container } = render(<DjUpcomingRow track={track()} idle={false} />);
    const row = container.querySelector('.djRow');
    expect(row?.getAttribute('draggable')).toBeNull();
  });

  it('dims further while autoplay is paused', () => {
    const { container } = render(<DjUpcomingRow track={track()} idle />);
    expect(container.querySelector('.djRowIdle')).toBeTruthy();
  });
});
