import { describe, it, expect } from 'vitest';
import { objectPositionY, detailFocusY, faceFocusY } from '../focalPoint';

describe('objectPositionY', () => {
  it('puts the focus at the anchor of the visible band', () => {
    // square photo in a 2.5:1 hero: 40% of the height is visible. Focus at 0.5, anchor 0.42:
    // band top = 0.5 - 0.168 = 0.332, as a share of the 0.6 that can move = 55.3%
    expect(objectPositionY(0.5, 1, 2.5)).toBeCloseTo(55.3, 1);
  });
  it('clamps to the top and bottom of the image', () => {
    expect(objectPositionY(0.05, 1, 2.5)).toBe(0);
    expect(objectPositionY(0.98, 1, 2.5)).toBe(100);
  });
  it('is 50 when nothing is cropped vertically', () => {
    expect(objectPositionY(0.2, 2, 1.5)).toBe(50);
    expect(objectPositionY(0.2, 1, 0)).toBe(50);
  });
  it('takes the image aspect into account', () => {
    // a 3:2 photo in the same hero shows more of its height, so it moves less
    expect(objectPositionY(0.5, 1.5, 2.5)).toBeCloseTo(62, 0); // (0.5 - 0.42 * 0.6) / 0.4
  });
});

describe('faceFocusY', () => {
  const face = (top: number, size: number, eyeY?: number) => ({ top, height: size, width: size, eyeY });
  it('is the eye line of one face', () => {
    expect(faceFocusY([face(0.4, 0.2, 0.47)])).toBeCloseTo(0.47);
  });
  it('estimates the eye line from the box when there are no keypoints', () => {
    expect(faceFocusY([face(0.4, 0.2)])).toBeCloseTo(0.48);
  });
  it('leans a group towards its highest eye line, so the top faces stay clear of the nav', () => {
    expect(faceFocusY([face(0.1, 0.15, 0.15), face(0.25, 0.2, 0.31), face(0.35, 0.15, 0.4)])).toBeCloseTo(0.225);
  });
  it('ignores faces much smaller than the largest', () => {
    expect(faceFocusY([face(0.3, 0.3, 0.4), face(0.8, 0.05, 0.82)])).toBeCloseTo(0.4);
  });
  it('ignores a stray face far from the group (Florence Road: a face low in the frame)', () => {
    // MediaPipe's real result on Florence Road's photo: three band members near the top, one stray near the bottom.
    const faces = [face(0.234, 0.115, 0.273), face(0.154, 0.105, 0.185), face(0.855, 0.127, 0.901), face(0.139, 0.182, 0.197)];
    expect(faceFocusY(faces)).toBeCloseTo(0.185 + 0.3 * (0.273 - 0.185), 3);
  });
  it('is null with no faces', () => {
    expect(faceFocusY([])).toBeNull();
  });
});

describe('detailFocusY', () => {
  const img = (w: number, h: number, busyFrom: number, busyTo: number) =>
    Uint8ClampedArray.from(
      Array.from({ length: w * h }, (_, i) => {
        const y = Math.floor(i / w);
        const v = y >= busyFrom && y < busyTo ? ((i * 97) % 256) : 128;
        return [v, v, v, 255];
      }).flat(),
    );
  it('finds the busiest band', () => {
    const y = detailFocusY(img(20, 50, 30, 40), 20, 50, 0.2);
    expect(y).toBeGreaterThan(0.55);
    expect(y).toBeLessThan(0.8);
  });
  it('prefers the upper-middle when two bands are equally busy, so a busy shirt does not beat a face', () => {
    const w = 20, h = 50;
    const px = Uint8ClampedArray.from(
      Array.from({ length: w * h }, (_, i) => {
        const y = Math.floor(i / w);
        const v = (y >= 12 && y < 20) || (y >= 38 && y < 46) ? ((i * 97) % 256) : 128;
        return [v, v, v, 255];
      }).flat(),
    );
    expect(detailFocusY(px, w, h, 0.2)).toBeLessThan(0.45);
  });
  it('is null for a flat image', () => {
    expect(detailFocusY(img(20, 50, 0, 0), 20, 50)).toBeNull();
  });
});
