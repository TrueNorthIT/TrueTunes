import { BASE_URL } from '../sonos/constants';

/** True once the login WebView is on a signed-in play.sonos.com page (not the login/auth hops). */
export function looksSignedIn(url: string): boolean {
  return url.startsWith(BASE_URL) && !url.includes('/login') && !url.includes('/api/auth');
}
