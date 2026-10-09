import { useEffect, useState } from 'react';

/** Returns RGBA pixels (row-major, 4 bytes each) of a small downscaled copy of the image, or null. */
export type PixelSampler = (src: string) => Promise<Uint8ClampedArray | number[] | null>;

let sampler: PixelSampler = async () => null;

/** Returns "r, g, b" directly (e.g. from a native palette library), or null. */
export type ColorExtractor = (uri: string) => Promise<string | null>;

let extractor: ColorExtractor | null = null;

/** Takes precedence over the pixel sampler when set. Pass null to unset. */
export function setColorExtractor(fn: ColorExtractor | null): void {
  extractor = fn;
}

/** The UI layer registers a native sampler (e.g. via a downscaled bitmap) here. */
export function setPixelSampler(fn: PixelSampler): void {
  sampler = fn;
}

/** Scores pixels and returns the most vibrant as "r, g, b". Ported verbatim from desktop. */
export function pickDominantColor(data: Uint8ClampedArray | number[]): string {
  // Score every pixel
  const candidates: { r: number; g: number; b: number; score: number; sat: number; lum: number }[] = [];
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255,
      g = data[i + 1] / 255,
      b = data[i + 2] / 255;
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    const lum = (max + min) / 2;
    const score = sat * (1 - Math.abs(lum - 0.45) * 1.8);
    candidates.push({ r: data[i], g: data[i + 1], b: data[i + 2], score, sat, lum });
  }

  // Sort best-first, then pick the first truly vibrant pixel.
  // Falls back to the raw top scorer if the whole image is dark/grey.
  candidates.sort((a, b) => b.score - a.score);
  const vibrant = candidates.find((c) => c.sat > 0.2 && c.lum > 0.18 && c.lum < 0.85);
  const pick = vibrant ?? candidates[0];

  return `${pick.r}, ${pick.g}, ${pick.b}`;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useDominantColor(src: string | null, { setGlobal = false } = {}): string | null {
  const [color, setColor] = useState<string | null>(null);

  useEffect(() => {
    if (!src) {
      setColor(null);
      return;
    }
    setColor(null); // clear stale color immediately while new image is analysed
    let cancelled = false;
    if (extractor) {
      extractor(src)
        .then((c) => {
          if (!cancelled && c) setColor(c);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }
    sampler(src)
      .then((data) => {
        if (cancelled || !data || data.length < 4) return;
        setColor(pickDominantColor(data));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [src]);

  // TODO(rn-ui): `setGlobal` used to write the --panel-color CSS variable on
  // document.documentElement. The RN UI layer should read the returned color
  // (e.g. via context) instead.

  return color;
}
