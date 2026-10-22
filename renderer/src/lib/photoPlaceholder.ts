import { useEffect, useState } from 'react';

/**
 * The service hands back a flat grey silhouette for artists without a photo (live: max saturation 0, luminance
 * spread 0.02). A real photo, even black and white, has far more spread. `rgba` is canvas ImageData.
 */
export function looksLikePlaceholder(rgba: ArrayLike<number>): boolean {
  let sum = 0, sum2 = 0, maxSat = 0, n = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const r = rgba[i] / 255, g = rgba[i + 1] / 255, b = rgba[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    maxSat = Math.max(maxSat, max === 0 ? 0 : (max - min) / max);
    sum += l; sum2 += l * l; n++;
  }
  if (n === 0) return false;
  const mean = sum / n;
  return maxSat < 0.05 && Math.sqrt(Math.max(0, sum2 / n - mean * mean)) < 0.06;
}

/** True once the (cached, same-origin) image at `src` is seen to be the placeholder; false while unknown. */
export function useIsPlaceholderPhoto(src: string | null): boolean {
  const [blank, setBlank] = useState(false);
  useEffect(() => {
    setBlank(false);
    if (!src) return;
    const img = new Image();
    img.onload = () => {
      const size = 32;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, size, size);
      setBlank(looksLikePlaceholder(ctx.getImageData(0, 0, size, size).data));
    };
    img.src = src;
  }, [src]);
  return blank;
}
