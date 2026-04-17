import { useEffect, useState } from 'react';

export function useDominantColor(src: string | null): string | null {
  const [color, setColor] = useState<string | null>(null);

  useEffect(() => {
    if (!src) { setColor(null); return; }
    setColor(null); // clear stale color immediately while new image is analysed
    const img = new Image();
    img.onload = () => {
      const size = 20;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, size, size);
      const { data } = ctx.getImageData(0, 0, size, size);

      // Score every pixel
      const candidates: { r: number; g: number; b: number; score: number; sat: number; lum: number }[] = [];
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const sat = max === 0 ? 0 : (max - min) / max;
        const lum = (max + min) / 2;
        const score = sat * (1 - Math.abs(lum - 0.45) * 1.8);
        candidates.push({ r: data[i], g: data[i + 1], b: data[i + 2], score, sat, lum });
      }

      // Sort best-first, then pick the first truly vibrant pixel.
      // Falls back to the raw top scorer if the whole image is dark/grey.
      candidates.sort((a, b) => b.score - a.score);
      const vibrant = candidates.find(c => c.sat > 0.2 && c.lum > 0.18 && c.lum < 0.85);
      const pick = vibrant ?? candidates[0];

      setColor(`${pick.r}, ${pick.g}, ${pick.b}`);
    };
    img.src = src;
  }, [src]);

  return color;
}
