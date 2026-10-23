import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SeekBar } from '../SeekBar';

function setup(durationMs = 210000, progressPct = 50) {
  render(
    <SeekBar
      progressPct={progressPct}
      durationMs={durationMs}
      elapsedLabel="1:45"
      durationLabel="3:30"
      className="bar"
      trackClassName="track"
      fillClassName="fill"
    />,
  );
  return screen.getByRole('slider', { name: 'Track progress' });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(window.sonos.seek).mockResolvedValue(undefined);
  vi.mocked(window.sonos.refreshPlayback).mockResolvedValue(undefined);
});

describe('SeekBar', () => {
  it('is a focusable slider that announces the time', () => {
    const bar = setup();
    expect(bar).toHaveAttribute('tabindex', '0');
    expect(bar).toHaveAttribute('aria-valuenow', '50');
    expect(bar).toHaveAttribute('aria-valuetext', '1:45 of 3:30');
  });

  it('ArrowRight and ArrowLeft move 5 seconds', async () => {
    const bar = setup(); // 50% of 210s = 105s
    fireEvent.keyDown(bar, { key: 'ArrowRight' });
    await waitFor(() => expect(window.sonos.seek).toHaveBeenLastCalledWith(110000));
    expect(window.sonos.refreshPlayback).toHaveBeenCalled();
    fireEvent.keyDown(bar, { key: 'ArrowLeft' });
    await waitFor(() => expect(window.sonos.seek).toHaveBeenLastCalledWith(100000));
  });

  it('Home seeks to 0 and End to the end of the track', async () => {
    const bar = setup();
    fireEvent.keyDown(bar, { key: 'Home' });
    await waitFor(() => expect(window.sonos.seek).toHaveBeenLastCalledWith(0));
    fireEvent.keyDown(bar, { key: 'End' });
    await waitFor(() => expect(window.sonos.seek).toHaveBeenLastCalledWith(210000));
  });

  it('clamps keyboard seeks to [0, durationMs]', async () => {
    const start = setup(210000, 1);
    fireEvent.keyDown(start, { key: 'ArrowLeft' });
    await waitFor(() => expect(window.sonos.seek).toHaveBeenLastCalledWith(0));
  });

  it('clamps at the end of the track', async () => {
    const bar = setup(210000, 99);
    fireEvent.keyDown(bar, { key: 'ArrowRight' });
    await waitFor(() => expect(window.sonos.seek).toHaveBeenLastCalledWith(210000));
  });

  it('ignores other keys', () => {
    fireEvent.keyDown(setup(), { key: 'a' });
    expect(window.sonos.seek).not.toHaveBeenCalled();
  });

  it('does nothing when durationMs is 0', () => {
    const bar = setup(0, 0);
    for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) fireEvent.keyDown(bar, { key });
    fireEvent.click(bar, { clientX: 10 });
    expect(window.sonos.seek).not.toHaveBeenCalled();
  });

  it('click seeks to the clicked fraction', async () => {
    const bar = setup(200000);
    bar.getBoundingClientRect = () => ({ left: 50, width: 100 }) as DOMRect;
    fireEvent.click(bar, { clientX: 100 });
    await waitFor(() => expect(window.sonos.seek).toHaveBeenCalledWith(100000));
  });
});
