import { useEffect, useState } from 'react';
import { fetchImage, getCachedVariant } from './imageCache';

/**
 * The service hands back a flat grey silhouette for artists without a photo (live: max saturation 0, luminance
 * spread 0.02). A real photo, even black and white, has far more spread. `rgba` is canvas ImageData.
 */
export function looksLikePlaceholder(rgba: ArrayLike<number>): boolean {
  let sum = 0,
    sum2 = 0,
    maxSat = 0,
    n = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const r = rgba[i] / 255,
      g = rgba[i + 1] / 255,
      b = rgba[i + 2] / 255;
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b);
    const l = (max + min) / 2;
    maxSat = Math.max(maxSat, max === 0 ? 0 : (max - min) / max);
    sum += l;
    sum2 += l * l;
    n++;
  }
  if (n === 0) return false;
  const mean = sum / n;
  return maxSat < 0.05 && Math.sqrt(Math.max(0, sum2 / n - mean * mean)) < 0.06;
}

/** What the artist's photo turned out to be. `unknown` while it loads or is being checked. */
export type PhotoState = 'unknown' | 'photo' | 'placeholder';

/** No URL is settled at once (no photo); otherwise it waits for the pixel check (`isPlaceholder` null until then). */
export function photoStateOf(hasUrl: boolean, isPlaceholder: boolean | null): PhotoState {
  if (!hasUrl) return 'placeholder';
  if (isPlaceholder === null) return 'unknown';
  return isPlaceholder ? 'placeholder' : 'photo';
}

/** Whether the image at `src` (an object URL) is the service's grey silhouette. An image that won't load counts too. */
function isPlaceholderImage(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const size = 32;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(false);
      ctx.drawImage(img, 0, 0, size, size);
      resolve(looksLikePlaceholder(ctx.getImageData(0, 0, size, size).data));
    };
    img.onerror = () => resolve(true);
    img.src = src;
  });
}

/**
 * Loads the photo at `url` (through the shared image cache) and checks it once. A photo that never loads counts
 * as a placeholder, so the hero falls back to the no-photo treatment instead of waiting forever.
 * When a smaller copy of the same photo is already cached (the tile the person just clicked), it is checked and
 * shown at once, then `src` sharpens to the full size when that arrives: a size the image service hasn't served
 * before takes about two seconds.
 */
export function usePhotoState(url: string | null): { state: PhotoState; src: string | null } {
  const [result, setResult] = useState<{ url: string; src: string | null; blank: boolean } | null>(null);
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const settle = (src: string | null, blank: boolean) => {
      if (!cancelled) setResult({ url, src, blank });
    };
    void (async () => {
      const preview = getCachedVariant(url);
      let blank: boolean | null = null;
      if (preview) {
        blank = await isPlaceholderImage(preview);
        settle(preview, blank);
      }
      // priority: the hero waits on this, so it must not queue behind the page's tiles
      const full = await fetchImage(url, true);
      if (cancelled) return;
      if (!full) {
        if (blank === null) settle(null, true);
        return;
      }
      blank ??= await isPlaceholderImage(full);
      settle(full, blank);
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);
  const r = url && result?.url === url ? result : null;
  return { state: photoStateOf(!!url, r ? r.blank : null), src: r && !r.blank ? r.src : null };
}
