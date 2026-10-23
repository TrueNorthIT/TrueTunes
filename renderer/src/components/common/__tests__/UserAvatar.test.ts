import { describe, it, expect } from 'vitest';
import { avatarGradient } from '../UserAvatar';

/** WCAG contrast of white on hsl(h, s%, l%). */
function whiteContrast(h: number, s: number, l: number): number {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = 0.2126 * lin(f(0)) + 0.7152 * lin(f(8)) + 0.0722 * lin(f(4));
  return 1.05 / (lum + 0.05);
}

// Enough names to land on every hue the mapping can produce.
const names = Array.from({ length: 3000 }, (_, i) => `Person ${i}`);
const stops = (name: string) =>
  [...avatarGradient(name).matchAll(/hsl\((\d+),(\d+)%,(\d+)%\)/g)].map(
    (m) => m.slice(1).map(Number) as [number, number, number]
  );

describe('avatar colours', () => {
  it('never lands on a purple or violet hue (250–330°)', () => {
    for (const n of names) for (const [h] of stops(n)) expect(h >= 250 && h < 330, `${n}: hue ${h}`).toBe(false);
  });

  it('keeps the white initial at 4.5:1 or better on every stop', () => {
    for (const n of names)
      for (const [h, s, l] of stops(n)) expect(whiteContrast(h, s, l), `${n}: hue ${h}`).toBeGreaterThanOrEqual(4.5);
  });

  it('is stable per name', () => {
    expect(avatarGradient('Rich')).toBe(avatarGradient('Rich'));
  });
});
