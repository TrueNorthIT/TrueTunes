import { queryOptions, useQuery } from '@tanstack/react-query';
import { detailFocusY, faceFocusY, FACE_ANCHOR, FOCUS_ANCHOR } from '../lib/focalPoint';
import { STALE, GC_HOUR } from '../lib/queryDefaults';

export interface PhotoFocus {
  /** Fraction of the image height to keep in view (0 top, 1 bottom). */
  y: number;
  /** How far down the visible band `y` should sit. */
  anchor: number;
  /** Image width / height. */
  aspect: number;
  /** How it was found: the faces, or (no face, or the detector failed) the band with the most detail. */
  via: 'face' | 'detail';
}

/** Resolves when the browser is idle (or, without requestIdleCallback, on the next task), so heavy work follows first paint. */
const whenIdle = () =>
  new Promise<void>((resolve) =>
    typeof requestIdleCallback === 'function'
      ? requestIdleCallback(() => resolve(), { timeout: 1500 })
      : setTimeout(resolve, 0)
  );

export async function findFocus(src: string): Promise<PhotoFocus | null> {
  // onload, not decode(): decode() waits for a frame, and never settles while the window is hidden
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = src;
  });
  const aspect = img.naturalWidth / img.naturalHeight;
  if (!aspect) return null;

  // Faces first, on a 512px copy: the 2000px source is slower and no more accurate for this. The detector blocks the
  // main thread for 50 to 300 ms, so wait until the page has painted.
  try {
    await whenIdle();
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = Math.round(512 / aspect);
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
    const { detectFaces } = await import('../lib/faceDetector');
    const y = faceFocusY(await detectFaces(canvas));
    if (y !== null) return { y, anchor: FACE_ANCHOR, aspect, via: 'face' };
  } catch (e) {
    console.warn('[photo-focus] face detection unavailable, using the detail heuristic', e);
  }

  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = Math.round(64 / aspect);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const y = detailFocusY(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
  return y === null ? null : { y, anchor: FOCUS_ANCHOR, aspect, via: 'detail' };
}

/**
 * Where the faces (or failing that, the detail) are in an artist photo, found once per photo URL. `src` is the
 * already-fetched same-origin copy, so the canvas is never tainted. null data means use the default crop.
 */
export const photoFocusKeys = {
  url: (url: string | null) => ['photo-focus', url] as const,
};

export const photoFocusQueryOptions = (url: string | null, src: string | null) =>
  queryOptions({
    queryKey: photoFocusKeys.url(url),
    queryFn: () => (src ? findFocus(src) : null),
    enabled: !!url && !!src,
    staleTime: STALE.forever,
    gcTime: GC_HOUR,
    retry: false,
  });

export function usePhotoFocus(url: string | null, src: string | null) {
  return useQuery(photoFocusQueryOptions(url, src));
}
