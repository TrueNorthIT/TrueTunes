import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useDominantColor, pickDominantColor, setPixelSampler, setColorExtractor } from '../useDominantColor';

describe('pickDominantColor', () => {
  it('picks a saturated pixel over grey ones', () => {
    expect(pickDominantColor([128, 128, 128, 255, 200, 50, 50, 255])).toBe('200, 50, 50');
  });
  it('falls back to top scorer for dark/grey images', () => {
    expect(pickDominantColor([10, 10, 10, 255, 20, 20, 20, 255])).toMatch(/^\d+, \d+, \d+$/);
  });
  it('prefers a mid-luminance vibrant pixel', () => {
    expect(pickDominantColor([255, 250, 250, 255, 0, 0, 5, 255, 60, 160, 60, 255])).toBe('60, 160, 60');
  });
});

describe('useDominantColor', () => {
  it('returns null when src is null', () => {
    const { result } = renderHook(() => useDominantColor(null));
    expect(result.current).toBeNull();
  });

  it('is null with the default sampler', async () => {
    setPixelSampler(async () => null);
    const { result } = renderHook(() => useDominantColor('http://x/a.jpg'));
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current).toBeNull();
  });

  it('returns a color from an injected sampler and resets on null src', async () => {
    setPixelSampler(async () => new Uint8ClampedArray([200, 50, 50, 255]));
    const { result, rerender } = renderHook(
      ({ src }: { src: string | null }) => useDominantColor(src),
      { initialProps: { src: 'http://x/a.jpg' as string | null } },
    );
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe('200, 50, 50'));
    rerender({ src: null });
    expect(result.current).toBeNull();
    setPixelSampler(async () => null);
  });

  it('prefers an injected color extractor over the pixel sampler', async () => {
    setPixelSampler(async () => new Uint8ClampedArray([200, 50, 50, 255]));
    setColorExtractor(async () => '1, 2, 3');
    const { result } = renderHook(() => useDominantColor('http://x/b.jpg'));
    await waitFor(() => expect(result.current).toBe('1, 2, 3'));
    setColorExtractor(null);
    setPixelSampler(async () => null);
  });
});
