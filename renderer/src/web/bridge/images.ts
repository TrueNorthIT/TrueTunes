// Artwork for the image cache: src/ipc/images.ts in gateway mode. play.sonos.com images go through the gateway's
// Sonos proxy; anything else (YouTube and Google CDNs, which a browser cannot read) goes through /img.

import type { Gateway } from './gateway';

/** https to play.sonos.com only, with no credentials in the URL. */
function sonosPath(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.hostname !== 'play.sonos.com' || u.username || u.password) return null;
    return `/sonos${u.pathname}${u.search}`;
  } catch {
    return null;
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function createImages(gateway: Gateway) {
  return async function fetchImage(url: string): Promise<{ data: string; mimeType: string } | { error: string }> {
    if (typeof url !== 'string' || !/^https?:\/\//.test(url)) return { error: 'Invalid URL' };
    try {
      const res = await gateway.fetch(sonosPath(url) ?? `/img?url=${encodeURIComponent(url)}`);
      if (!res) return { error: 'No Entra token' };
      if (!res.ok) return { error: `${res.status} ${res.statusText}` };
      const mimeType = res.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg';
      return { data: toBase64(new Uint8Array(await res.arrayBuffer())), mimeType };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  };
}
