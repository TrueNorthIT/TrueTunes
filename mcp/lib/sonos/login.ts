// Headless sign-in to play.sonos.com with the office Sonos account.
//
// play.sonos.com is a NextAuth app whose only provider is Okta (login.sonos.com, classic "v1" pipeline).
// Instead of driving the hosted login page we:
//   1. start NextAuth's Okta sign-in (CSRF + signin/okta), which sets its state/PKCE cookies and hands back
//      the Okta authorize URL;
//   2. trade the username and password for a one-time Okta sessionToken (POST /api/v1/authn);
//   3. call the authorize URL with that sessionToken, so Okta redirects straight back with a code;
//   4. let NextAuth's callback redeem the code, which sets __Secure-next-auth.session-token.
// The result is the same session cookie the desktop app captures from its sign-in window.

import { BASE_URL, UA } from './constants';
import { absorb, cookieHeader, sessionOnly, type CookieJar } from './cookies';

export class SonosLoginError extends Error {}

const PLAY_ORIGIN = new URL(BASE_URL).origin;

async function hop(jar: CookieJar, url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    redirect: 'manual',
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
      ...(Object.keys(jar).length ? { Cookie: cookieHeader(jar) } : {}),
      ...init.headers,
    },
    signal: AbortSignal.timeout(15_000),
  });
  absorb(jar, res.headers.getSetCookie());
  return res;
}

export async function loginToSonos(username: string, password: string): Promise<CookieJar> {
  const play: CookieJar = {};
  const okta: CookieJar = {};

  // 1 ─ NextAuth: CSRF token, then start the Okta flow.
  const csrfRes = await hop(play, `${BASE_URL}/api/auth/csrf`);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken?: string };
  if (!csrfToken) throw new SonosLoginError(`play.sonos.com gave no CSRF token (${csrfRes.status})`);

  const signinRes = await hop(play, `${BASE_URL}/api/auth/signin/okta`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken, callbackUrl: `${BASE_URL}/en-us/web-app`, json: 'true' }),
  });
  const { url: authorizeUrl } = (await signinRes.json()) as { url?: string };
  if (!authorizeUrl?.includes('/authorize')) {
    throw new SonosLoginError(`play.sonos.com did not start the Okta sign-in (${signinRes.status})`);
  }
  const authorize = new URL(authorizeUrl);

  // 2 ─ Okta primary authentication.
  const authnRes = await hop(okta, `${authorize.origin}/api/v1/authn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      username,
      password,
      options: { warnBeforePasswordExpired: false, multiOptionalFactorEnroll: false },
    }),
  });
  const authn = (await authnRes.json().catch(() => ({}))) as {
    status?: string;
    sessionToken?: string;
    errorSummary?: string;
  };
  if (!authnRes.ok) {
    throw new SonosLoginError(`Sonos refused the sign-in: ${authn.errorSummary ?? authnRes.status}`);
  }
  if (authn.status !== 'SUCCESS' || !authn.sessionToken) {
    throw new SonosLoginError(
      `Sonos sign-in needs more than a password (Okta status ${authn.status}). ` +
        'The office account must not require MFA or a password change.'
    );
  }

  // 3 ─ Authorize with the sessionToken; follow Okta's redirects until it sends us back to play.sonos.com.
  authorize.searchParams.set('sessionToken', authn.sessionToken);
  let next = authorize.toString();
  for (let i = 0; i < 8 && new URL(next).origin !== PLAY_ORIGIN; i++) {
    const res = await hop(okta, next);
    const location = res.headers.get('location');
    if (!location) throw new SonosLoginError(`Okta authorize stopped at HTTP ${res.status} without a redirect`);
    next = new URL(location, next).toString();
  }
  const callback = new URL(next);
  if (callback.origin !== PLAY_ORIGIN) throw new SonosLoginError('Okta never redirected back to play.sonos.com');
  const oauthError = callback.searchParams.get('error');
  if (oauthError) {
    throw new SonosLoginError(`Okta: ${callback.searchParams.get('error_description') ?? oauthError}`);
  }

  // 4 ─ NextAuth callback redeems the code and sets the session cookie.
  for (let i = 0; i < 3 && !Object.keys(sessionOnly(play)).length; i++) {
    const res = await hop(play, next);
    const location = res.headers.get('location');
    if (!location) break;
    next = new URL(location, next).toString();
    if (new URL(next).origin !== PLAY_ORIGIN) break;
  }

  const session = sessionOnly(play);
  if (!Object.keys(session).length) throw new SonosLoginError('Sonos sign-in finished without a session cookie');
  return session;
}
