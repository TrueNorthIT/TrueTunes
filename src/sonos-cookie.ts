// Kept free of Electron imports so `npm run test:main` can exercise it.

/** The only host the Sonos session cookie belongs to (a host-only `__Secure-` cookie set by play.sonos.com). */
export const SONOS_HOST = 'play.sonos.com';

/**
 * Whether a main-process request to `url` may carry the Sonos session cookie:
 * https to the Sonos web app host only. Image URLs from the renderer point at
 * Google and YouTube CDNs too, and they must never see the token.
 */
export function sendsSessionCookie(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === SONOS_HOST && !u.username && !u.password;
  } catch {
    return false;
  }
}
