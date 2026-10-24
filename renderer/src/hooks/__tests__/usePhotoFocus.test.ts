import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDetectFaces = vi.fn();
vi.mock('../../lib/faceDetector', () => ({ detectFaces: (...a: unknown[]) => mockDetectFaces(...a) }));

import { findFocus } from '../usePhotoFocus';

beforeEach(() => {
  mockDetectFaces.mockReset();
  // and give them a square 2000px size
  // jsdom never loads images: fire onload as soon as src is set
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: true,
    set(this: HTMLImageElement) {
      queueMicrotask(() => this.onload?.(new Event('load')));
    },
  });
  Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', { configurable: true, get: () => 2000 });
  Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', { configurable: true, get: () => 2000 });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

describe('findFocus', () => {
  it('focuses on the eye line of the faces when MediaPipe finds some', async () => {
    mockDetectFaces.mockResolvedValue([{ top: 0.4, height: 0.2, width: 0.2, eyeY: 0.47 }]);
    expect(await findFocus('blob:x')).toEqual({ y: 0.47, anchor: 1 / 3, aspect: 1, via: 'face' });
  });

  it('falls back to the detail heuristic when MediaPipe fails to load', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockDetectFaces.mockRejectedValue(new Error('wasm blocked'));
    // no canvas in jsdom, so the heuristic has nothing to read: the default crop
    expect(await findFocus('blob:x')).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('falls back when no face is found', async () => {
    mockDetectFaces.mockResolvedValue([]);
    expect(await findFocus('blob:x')).toBeNull();
  });
});
