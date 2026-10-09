import CookieManager from '@preeternal/react-native-cookie-manager';
import { BASE_URL, SESSION_COOKIE } from '@truetunes/core/sonos/constants';

/** The HttpOnly next-auth session token from the WebView's cookie jar (native read), or null. */
export async function readSonosSessionToken(): Promise<string | null> {
  const cookies = await CookieManager.get(BASE_URL);
  return cookies[SESSION_COOKIE]?.value ?? null;
}

export async function clearSonosCookies(): Promise<void> {
  await CookieManager.clearAll();
}
