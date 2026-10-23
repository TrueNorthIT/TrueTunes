import { describe, it, expect } from 'vitest';
import { withArtworkSize } from '../artworkUrl';

describe('withArtworkSize', () => {
  it('rewrites the width and height, keeping the rest of the spec', () => {
    expect(withArtworkSize('https://lh3.googleusercontent.com/abc=w544-h544-l90-rj')).toBe(
      'https://lh3.googleusercontent.com/abc=w2000-h2000-l90-rj',
    );
  });
  it('accepts a custom size', () => {
    expect(withArtworkSize('https://x/y=w60-h60-s', 800)).toBe('https://x/y=w800-h800-s');
  });
  it('leaves URLs without a size spec unchanged', () => {
    expect(withArtworkSize('https://example.test/tile.jpg')).toBe('https://example.test/tile.jpg');
    expect(withArtworkSize('')).toBe('');
  });
});
