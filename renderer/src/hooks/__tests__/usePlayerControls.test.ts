// Rapid clicks on the volume control used to snap the widget back: the push for an older
// click arrived after the newer one was sent, and the WS sync overwrote the local value.
// A volume push must be ignored while our own set-volume request is still in flight.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const setVolume = vi.fn();
vi.mock('../../providers', () => ({
  getActiveProvider: () => ({ setVolume: (...args: unknown[]) => setVolume(...args) }),
}));

import { useVolumeControl } from '../usePlayerControls';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useVolumeControl — stale volume push race', () => {
  it('keeps the local value while a set-volume request is in flight', () => {
    setVolume.mockReturnValue(new Promise<void>(() => {})); // never resolves
    const { result, rerender } = renderHook(({ volume }) => useVolumeControl(volume), { initialProps: { volume: 50 } });

    act(() => {
      result.current.step(+1); // 50 -> 51, sent 150ms after the last change
    });
    expect(result.current.localVol).toBe(51);

    vi.advanceTimersByTime(150);
    expect(setVolume).toHaveBeenCalledWith(51);

    // The response/push for an older state (50) lands while 51 is being applied: ignored.
    rerender({ volume: 50 });
    expect(result.current.localVol).toBe(51);
  });

  it('applies the confirmed value once the request resolves', () => {
    let resolveSet!: (v?: void) => void;
    setVolume.mockReturnValue(new Promise<void>((resolve) => (resolveSet = resolve)));
    const { result, rerender } = renderHook(({ volume }) => useVolumeControl(volume), { initialProps: { volume: 50 } });

    act(() => {
      result.current.step(+1);
    });
    vi.advanceTimersByTime(150);

    // A different client changes the volume to 75 while our 51 is still in flight: ignored.
    rerender({ volume: 75 });
    expect(result.current.localVol).toBe(51);

    act(() => {
      resolveSet();
    });
    expect(result.current.localVol).toBe(51);
  });

  it('follows external volume changes when nothing is in flight', async () => {
    setVolume.mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ volume }) => useVolumeControl(volume), { initialProps: { volume: 50 } });

    rerender({ volume: 80 });
    expect(result.current.localVol).toBe(80);

    // ...including after one of our own requests has already been confirmed.
    act(() => {
      result.current.step(+1);
    });
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    rerender({ volume: 90 });
    expect(result.current.localVol).toBe(90);
  });
});
