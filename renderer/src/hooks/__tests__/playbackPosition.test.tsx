import { describe, it, expect } from 'vitest';
import { act, render } from '@testing-library/react';
import { setPlaybackPosition, usePlaybackPosition, ZERO_POSITION } from '../playbackPosition';

const at = (positionMs: number) => ({ ...ZERO_POSITION, positionMs, durationMs: 180000, trackEndsAtMs: 1 });

describe('usePlaybackPosition', () => {
  it('re-renders readers on every tick, but a selector reader only when its value changes', () => {
    let whole = 0;
    let line = 0;
    function Whole() {
      whole++;
      usePlaybackPosition();
      return null;
    }
    function Line() {
      line++;
      usePlaybackPosition((p) => Math.floor(p.positionMs / 10000));
      return null;
    }
    act(() => setPlaybackPosition(at(0)));
    render(
      <>
        <Whole />
        <Line />
      </>
    );
    const [w0, l0] = [whole, line];
    act(() => setPlaybackPosition(at(1000)));
    act(() => setPlaybackPosition(at(2000)));
    expect(whole).toBe(w0 + 2);
    expect(line).toBe(l0);
    act(() => setPlaybackPosition(at(10000)));
    expect(line).toBe(l0 + 1);
  });
});
