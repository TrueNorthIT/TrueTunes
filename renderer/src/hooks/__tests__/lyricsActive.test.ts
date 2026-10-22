import { describe, it, expect } from 'vitest';
import { activeLyricIndex, lyricElapsedMs } from '../useLyrics';

const lines = [
  { timeMs: 1000, text: 'one' },
  { timeMs: 5000, text: 'two' },
  { timeMs: 9000, text: 'three' },
];

describe('activeLyricIndex: which synced line is current', () => {
  it('returns -1 before the first line', () => {
    expect(activeLyricIndex(lines, 999), 'Expected no active line before the first timestamp').toBe(-1);
  });

  it('returns the last line whose time has passed', () => {
    expect(activeLyricIndex(lines, 6000), 'Expected the second line at 6s').toBe(1);
    expect(activeLyricIndex(lines, 99_000), 'Expected the last line after the end').toBe(2);
  });

  it('treats a line as active exactly at its timestamp', () => {
    expect(activeLyricIndex(lines, 5000), 'Expected the boundary to be inclusive').toBe(1);
  });

  it('returns -1 for no lines', () => {
    expect(activeLyricIndex([], 5000), 'Expected -1 for empty lyrics').toBe(-1);
  });
});

describe('lyricElapsedMs: progress percent to elapsed, with the display lead', () => {
  it('converts a percentage of the duration and adds the 250ms lead', () => {
    expect(lyricElapsedMs(50, 200_000), 'Expected 100s plus the lead').toBe(100_250);
  });

  it('is just the lead at zero progress', () => {
    expect(lyricElapsedMs(0, 0), 'Expected only the lead with nothing playing').toBe(250);
  });
});
