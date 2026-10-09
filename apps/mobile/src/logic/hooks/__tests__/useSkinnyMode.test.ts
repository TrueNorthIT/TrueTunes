import { describe, it, expect, vi } from 'vitest';

vi.mock('react-native', () => ({ useWindowDimensions: () => ({ width: 1280, height: 800 }) }));

import { computeSkinny, FULL_MIN } from '../useSkinnyMode';

describe('computeSkinny', () => {
  it('goes skinny below FULL_MIN', () => {
    expect(computeSkinny(FULL_MIN - 1, false)).toBe(true);
    expect(computeSkinny(FULL_MIN, false)).toBe(false);
  });
  it('stays skinny until past the exit buffer', () => {
    expect(computeSkinny(FULL_MIN + 40, true)).toBe(true);
    expect(computeSkinny(FULL_MIN + 41, true)).toBe(false);
  });
});
