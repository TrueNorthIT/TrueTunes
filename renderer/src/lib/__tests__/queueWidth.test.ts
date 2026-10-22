import { describe, it, expect } from 'vitest';
import { effectiveDockedWidth, MIN_DOCKED_WIDTH } from '../queueWidth';

describe('effectiveDockedWidth', () => {
  it('keeps the preferred width when the window has room', () => {
    expect(effectiveDockedWidth(380, 1920)).toBe(380);
    expect(effectiveDockedWidth(380, 1280)).toBe(380);
  });

  it('narrows to leave the player bar its room', () => {
    expect(effectiveDockedWidth(700, 1280)).toBe(1280 - 864);
  });

  it('never goes below the minimum, even in a skinny window', () => {
    expect(effectiveDockedWidth(380, 400)).toBe(MIN_DOCKED_WIDTH);
    expect(effectiveDockedWidth(380, 900)).toBe(MIN_DOCKED_WIDTH);
    expect(effectiveDockedWidth(380, 0)).toBe(MIN_DOCKED_WIDTH);
  });

  it('comes back to the preference after a narrow window (400 then 1280)', () => {
    const pref = 380;
    const widths = [1280, 400, 1280].map((w) => effectiveDockedWidth(pref, w));
    expect(widths).toEqual([380, 280, 380]);
  });

  it('comes back after a trip through 900 too', () => {
    const pref = 380;
    expect([1280, 900, 1150, 1280].map((w) => effectiveDockedWidth(pref, w))).toEqual([380, 280, 286, 380]);
  });
});
