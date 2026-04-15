import { useEffect, useState } from 'react';

export function useDominantColor(src: string | null): string | null {
  const [color, setColor] = useState<string | null>(null);

  useEffect(() => {
    if (!src) { setColor(null); return; }
    const img = new Image();
    img.onload = () => {
      const size = 20;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, size, size);
      const { data } = ctx.getImageData(0, 0, size, size);

      let bestR = 128, bestG = 128, bestB = 128, bestScore = -1;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const sat = max === 0 ? 0 : (max - min) / max;
        const lum = (max + min) / 2;
        const score = sat * (1 - Math.abs(lum - 0.45) * 1.8);
        if (score > bestScore) {
          bestScore = score;
          bestR = data[i]; bestG = data[i + 1]; bestB = data[i + 2];
        }
      }
      setColor(`${bestR}, ${bestG}, ${bestB}`);
    };
    img.src = src;
  }, [src]);

  return color;
}
