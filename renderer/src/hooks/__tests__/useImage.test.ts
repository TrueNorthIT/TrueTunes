import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// imageCache is a module-level singleton — reset between tests
let getCached: ReturnType<typeof vi.fn>;
let fetchImage: ReturnType<typeof vi.fn>;

vi.mock('../../lib/imageCache', () => ({
  get getCached() { return getCached; },
  get fetchImage() { return fetchImage; },
}));

beforeEach(() => {
  getCached  = vi.fn().mockReturnValue(null);
  fetchImage = vi.fn().mockReturnValue(new Promise(() => {})); // pending by default
});

// Dynamic import so the mock is applied before the module loads
async function importUseImage() {
  const mod = await import('../useImage');
  return mod.useImage;
}

describe('useImage', () => {
  it('returns null when url is null', async () => {
    const useImage = await importUseImage();
    const { result } = renderHook(() => useImage(null));
    expect(result.current).toBeNull();
  });

  it('returns null when url is undefined', async () => {
    const useImage = await importUseImage();
    const { result } = renderHook(() => useImage(undefined));
    expect(result.current).toBeNull();
  });

  it('returns cached value synchronously if already cached', async () => {
    getCached = vi.fn().mockReturnValue('blob:cached');
    const useImage = await importUseImage();
    const { result } = renderHook(() => useImage('https://example.com/art.jpg'));
    expect(result.current).toBe('blob:cached');
  });

  it('calls fetchImage and updates state when not cached', async () => {
    getCached  = vi.fn().mockReturnValue(null);
    fetchImage = vi.fn().mockResolvedValue('blob:fetched');
    const useImage = await importUseImage();
    const { result } = renderHook(() => useImage('https://example.com/art.jpg'));
    // Initially null while pending
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe('blob:fetched'));
  });

  it('clears src when url changes to null', async () => {
    getCached  = vi.fn().mockReturnValue(null);
    fetchImage = vi.fn().mockResolvedValue('blob:old');
    const useImage = await importUseImage();
    const { result, rerender } = renderHook(
      ({ url }) => useImage(url),
      { initialProps: { url: 'https://example.com/art.jpg' as string | null } }
    );
    await waitFor(() => expect(result.current).toBe('blob:old'));
    rerender({ url: null });
    expect(result.current).toBeNull();
  });
});
