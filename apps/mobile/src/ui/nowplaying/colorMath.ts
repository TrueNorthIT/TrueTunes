/** Pure colour maths for the Now Playing tint. No React Native imports (unit-tested in node). */

export function hexToRgb(hex: string | null | undefined): [number, number, number] | null {
  if (!hex) return null;
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length === 8) h = h.slice(0, 6); // drop alpha
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Relative luminance 0..1 (Rec. 709 on gamma-encoded values; good enough for a guard). */
export function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Near-black / near-white colours make a useless tint. */
export function isTintable(r: number, g: number, b: number): boolean {
  const l = luminance(r, g, b);
  return l >= 0.1 && l <= 0.9;
}

/** "#rrggbb" -> "r, g, b", or null when unparseable or near-black/near-white. */
export function hexToTintRgb(hex: string | null | undefined): string | null {
  const rgb = hexToRgb(hex);
  if (!rgb || !isTintable(...rgb)) return null;
  return rgb.join(', ');
}

/** Picks vibrant, else dominant, else average from an Android image-colors result. */
export function pickTintFromColors(c: { vibrant?: string; dominant?: string; average?: string } | null | undefined): string | null {
  if (!c) return null;
  for (const hex of [c.vibrant, c.dominant, c.average]) {
    const out = hexToTintRgb(hex);
    if (out) return out;
  }
  return null;
}

export function rgba(rgb: string, alpha: number): string {
  return `rgba(${rgb}, ${alpha})`;
}
