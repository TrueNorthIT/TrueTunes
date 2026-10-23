import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { looksLikePlaceholder, photoStateOf } from '../photoPlaceholder';

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

describe('photoStateOf', () => {
  it('settles at once when there is no photo URL', () => {
    expect(photoStateOf(false, null)).toBe('placeholder');
  });
  it('stays unknown while the image loads or is being checked, so the hero never commits early', () => {
    expect(photoStateOf(true, null)).toBe('unknown');
  });
  it('is photo or placeholder once checked', () => {
    expect(photoStateOf(true, false)).toBe('photo');
    expect(photoStateOf(true, true)).toBe('placeholder');
  });
});

describe('usePhotoState', () => {
  it('falls back to the no-photo treatment when the photo never loads', async () => {
    vi.resetModules();
    vi.doMock('../imageCache', () => ({ fetchImage: () => Promise.resolve(null), getCachedVariant: () => null }));
    const { usePhotoState } = await import('../photoPlaceholder');
    const { result } = renderHook(() => usePhotoState('https://lh3.example/a=w2000-h2000'));
    expect(result.current.state).toBe('unknown');
    await waitFor(() => expect(result.current).toEqual({ state: 'placeholder', src: null }));
    vi.doUnmock('../imageCache');
  });
});
