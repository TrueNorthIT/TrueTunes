import { describe, it, expect } from 'vitest';
import { followScrollTop, plainLyricLines } from '../useLiveLyrics';

describe('plainLyricLines: unsynced lyrics as lines', () => {
  it('trims lines and drops the blank ones between verses', () => {
    expect(plainLyricLines('  One  \n\nTwo\r\n   \nThree')).toEqual(['One', 'Two', 'Three']);
  });
  it('is empty for no lyrics', () => {
    expect(plainLyricLines(null)).toEqual([]);
    expect(plainLyricLines('')).toEqual([]);
  });
});

describe('followScrollTop: where to scroll so the active line sits in place', () => {
  it('puts the line centre the given fraction down the box', () => {
    // Line centre at 1000 + 20; 40% of a 500px box is 200.
    expect(followScrollTop(1000, 40, 500, 0.4)).toBe(820);
  });
  it('never scrolls above the top', () => {
    expect(followScrollTop(10, 40, 500, 0.5)).toBe(0);
  });
});
