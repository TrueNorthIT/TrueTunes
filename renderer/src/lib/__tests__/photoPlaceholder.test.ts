import { describe, it, expect } from 'vitest';
import { looksLikePlaceholder } from '../photoPlaceholder';

const px = (n: number, f: (i: number) => [number, number, number]) =>
  Uint8ClampedArray.from(Array.from({ length: n }, (_, i) => [...f(i), 255]).flat());

describe('looksLikePlaceholder', () => {
  it('flags a flat grey silhouette', () => {
    expect(looksLikePlaceholder(px(1024, i => (i % 50 < 4 ? [84, 84, 84] : [77, 77, 77])))).toBe(true);
  });
  it('does not flag a colour photo', () => {
    expect(looksLikePlaceholder(px(1024, i => [(i * 7) % 256, (i * 3) % 256, 90]))).toBe(false);
  });
  it('does not flag a black and white photo, which has real contrast', () => {
    expect(looksLikePlaceholder(px(1024, i => { const v = (i * 37) % 256; return [v, v, v]; }))).toBe(false);
  });
  it('does not flag an empty image', () => {
    expect(looksLikePlaceholder(new Uint8ClampedArray(0))).toBe(false);
  });
});
