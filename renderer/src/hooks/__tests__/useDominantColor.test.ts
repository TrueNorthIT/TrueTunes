import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDominantColor } from '../useDominantColor';

// Simulate canvas + Image so the hook can run in jsdom
const mockGetImageData = vi.fn();
const mockDrawImage = vi.fn();
const mockGetContext = vi.fn(() => ({
  drawImage: mockDrawImage,
  getImageData: mockGetImageData,
}));

let imageOnLoad: (() => void) | null = null;

class MockImage {
  onload: (() => void) | null = null;
  _src = '';
  set src(val: string) {
    this._src = val;
    imageOnLoad = this.onload;
  }
}

const originalCreateElement = document.createElement.bind(document);

beforeEach(() => {
  vi.clearAllMocks();
  imageOnLoad = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).Image = MockImage;
  const mockCanvas = { width: 0, height: 0, getContext: mockGetContext };
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'canvas') return mockCanvas as unknown as HTMLElement;
    return originalCreateElement(tag as keyof HTMLElementTagNameMap);
  });
  // Default: vibrant pixel
  mockGetImageData.mockReturnValue({
    data: new Uint8ClampedArray([200, 50, 50, 255]), // saturated red
  });
});

describe('useDominantColor', () => {
  it('returns null when src is null', () => {
    const { result } = renderHook(() => useDominantColor(null));
    expect(result.current).toBeNull();
  });

  it('returns null initially while image loads', () => {
    const { result } = renderHook(() => useDominantColor('http://example.com/art.jpg'));
    expect(result.current).toBeNull();
  });

  it('returns a color string after image loads', () => {
    const { result } = renderHook(() => useDominantColor('http://example.com/art.jpg'));
    act(() => {
      imageOnLoad?.();
    });
    expect(result.current).not.toBeNull();
    expect(result.current).toMatch(/^\d+, \d+, \d+$/);
  });

  it('resets to null when src becomes null', () => {
    const { result, rerender } = renderHook(
      ({ src }: { src: string | null }) => useDominantColor(src),
      { initialProps: { src: 'http://example.com/art.jpg' } }
    );
    act(() => { imageOnLoad?.(); });
    expect(result.current).not.toBeNull();

    rerender({ src: null });
    expect(result.current).toBeNull();
  });

  it('returns null when canvas context is unavailable', () => {
    mockGetContext.mockReturnValueOnce(null);
    const { result } = renderHook(() => useDominantColor('http://example.com/art.jpg'));
    act(() => { imageOnLoad?.(); });
    expect(result.current).toBeNull();
  });
});
