import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SkinnyTransport } from '../skinny/SkinnyTransport';
import type { useNowPlaying } from '../../hooks/useNowPlaying';

const mockUseQueuer = vi.fn();
vi.mock('../../hooks/useQueuer', () => ({ useQueuer: (...a: unknown[]) => mockUseQueuer(...a) }));

function makeNP(overrides: Record<string, unknown> = {}) {
  return {
    displayTrack: 'Let It Happen',
    displayArtist: 'Tame Impala',
    cachedArt: null,
    dominantColor: '120, 80, 40',
    progressPct: 25,
    isPlaying: true,
    elapsedLabel: '1:57',
    durationLabel: '7:48',
    durationMs: 468000,
    currentObjectId: 'track-1',
    ...overrides,
  } as unknown as ReturnType<typeof useNowPlaying>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseQueuer.mockReturnValue(null);
  vi.mocked(window.sonos.pause).mockResolvedValue(undefined);
  vi.mocked(window.sonos.refreshPlayback).mockResolvedValue(undefined);
});

describe('SkinnyTransport', () => {
  it('leads with the title and artist in a Now playing region', () => {
    render(<SkinnyTransport np={makeNP()} isAuthed />);
    const region = screen.getByRole('region', { name: 'Now playing' });
    expect(region).toHaveTextContent('Let It Happen');
    expect(region).toHaveTextContent('Tame Impala');
  });

  it('shows who queued the track', () => {
    mockUseQueuer.mockReturnValue({ user: 'Joe Pitts', imageUrl: null });
    render(<SkinnyTransport np={makeNP()} isAuthed />);
    expect(screen.getByText('Queued by Joe Pitts')).toBeInTheDocument();
    expect(mockUseQueuer).toHaveBeenCalledWith({ id: 'track-1', title: 'Let It Happen', artist: 'Tame Impala' });
  });

  it('has no queued-by label when nobody in the office queued it', () => {
    render(<SkinnyTransport np={makeNP()} isAuthed />);
    expect(screen.queryByText(/Queued by/)).toBeNull();
  });

  it('washes the card with the artwork colour', () => {
    render(<SkinnyTransport np={makeNP()} isAuthed />);
    expect(screen.getByRole('region', { name: 'Now playing' }).style.getPropertyValue('--wash')).toBe('120, 80, 40');
  });

  it('says nothing is playing without a track', () => {
    render(<SkinnyTransport np={makeNP({ displayTrack: '', displayArtist: '' })} isAuthed />);
    expect(screen.getByText('Nothing playing')).toBeInTheDocument();
  });

  it('disables the transport when signed out', () => {
    render(<SkinnyTransport np={makeNP()} isAuthed={false} />);
    for (const name of ['Previous', 'Pause', 'Next']) expect(screen.getByRole('button', { name })).toBeDisabled();
  });

  it('Pause calls pause then refreshPlayback', async () => {
    const user = userEvent.setup();
    render(<SkinnyTransport np={makeNP()} isAuthed />);
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    await waitFor(() => expect(window.sonos.pause).toHaveBeenCalled());
    expect(window.sonos.refreshPlayback).toHaveBeenCalled();
  });
});
