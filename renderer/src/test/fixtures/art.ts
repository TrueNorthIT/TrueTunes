// Generated artwork for the mock backend: no real covers, no real photos, no network.
// An art URL is a synthetic https URL on a host that does not resolve. The mock runtime (../mockRuntime.ts) answers
// fetches to it with the SVG below, so the app's own image cache and its "https only" art checks behave as in production.

export const ART_HOST = 'art.mock.invalid';

/** A small deterministic hash (FNV-1a), so the same seed always draws the same picture. */
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const hue = (n: number) => n % 360;

/** The picture for a seed. Seeds starting `portrait:` get a head-and-shoulders silhouette; the rest get a sleeve. */
export function artSvg(seed: string): string {
  const h = hash(seed);
  const a = hue(h);
  const b = hue(h >>> 9);
  const from = `hsl(${a} 70% 52%)`;
  const to = `hsl(${b} 65% 22%)`;
  const light = `hsl(${hue(a + 40)} 85% 78%)`;
  const defs = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="600" height="600" fill="url(#g)"/>`;
  let shape: string;
  if (seed.startsWith('portrait:')) {
    shape = `<circle cx="300" cy="230" r="95" fill="${light}"/><path d="M110 600 Q300 330 490 600Z" fill="${light}"/>`;
  } else {
    const kind = (h >>> 18) % 4;
    const x = 170 + ((h >>> 4) % 120);
    shape =
      kind === 0
        ? `<circle cx="300" cy="${x + 120}" r="170" fill="${light}" opacity="0.85"/>`
        : kind === 1
          ? `<polygon points="300,120 ${x + 260},460 ${x - 30},460" fill="${light}" opacity="0.75"/>`
          : kind === 2
            ? `<rect x="${x}" y="170" width="260" height="260" fill="none" stroke="${light}" stroke-width="22"/>`
            : `<path d="M0 380 Q150 ${x} 300 380 T600 380 V600 H0Z" fill="${light}" opacity="0.7"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">${defs}${shape}</svg>`;
}

/** The art URL the catalogue hands out for a seed. */
export const artUrl = (seed: string) => `https://${ART_HOST}/${encodeURIComponent(seed)}.svg`;

/** The seed back out of an art URL, or null when the URL is not one of ours. */
export function seedOfArtUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname !== ART_HOST) return null;
    return decodeURIComponent(u.pathname.replace(/^\//, '').replace(/\.svg$/, ''));
  } catch {
    return null;
  }
}

/** Base64 of the SVG, for the bridge's fetchImage. */
export const artBase64 = (seed: string) => btoa(artSvg(seed));
