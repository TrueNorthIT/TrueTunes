import { describe, it, expect } from 'vitest';
import { getPlaylistColor } from '../playlistColor';

describe('getPlaylistColor', () => {
  it('never lands on a violet hue', () => {
    for (let i = 0; i < 2000; i++) {
      const hues = [...getPlaylistColor(`playlist ${i}`).matchAll(/hsl\((\d+)/g)].map((m) => Number(m[1]));
      for (const h of hues) expect(h >= 250 && h < 330).toBe(false);
    }
  });
});
