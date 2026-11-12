// A tiny per-host cookie jar for the headless Sonos sign-in and the rolling NextAuth session cookie.
// No imports, so node:test can load it directly.

export type CookieJar = Record<string, string>;

/** NextAuth's session cookie on play.sonos.com. Large sessions are split into `.0`, `.1`, … chunks. */
export const SESSION_COOKIE = '__Secure-next-auth.session-token';

export function isSessionCookie(name: string): boolean {
  return name === SESSION_COOKIE || name.startsWith(`${SESSION_COOKIE}.`);
}

interface ParsedSetCookie {
  name: string;
  value: string;
  expired: boolean;
}

export function parseSetCookie(header: string, now = Date.now()): ParsedSetCookie | null {
  const [pair, ...attrs] = header.split(';');
  const eq = pair.indexOf('=');
  if (eq <= 0) return null;
  const name = pair.slice(0, eq).trim();
  const value = pair.slice(eq + 1).trim();
  let expired = value === '';
  for (const attr of attrs) {
    const [rawKey, ...rest] = attr.split('=');
    const key = rawKey.trim().toLowerCase();
    const val = rest.join('=').trim();
    if (key === 'max-age' && Number(val) <= 0) expired = true;
    if (key === 'expires') {
      const at = Date.parse(val);
      if (!Number.isNaN(at) && at <= now) expired = true;
    }
  }
  return { name, value, expired };
}

/** Applies Set-Cookie headers to the jar. Returns true if anything changed. */
export function absorb(jar: CookieJar, setCookies: string[], only?: (name: string) => boolean): boolean {
  let changed = false;
  for (const header of setCookies) {
    const c = parseSetCookie(header);
    if (!c || (only && !only(c.name))) continue;
    if (c.expired) {
      if (c.name in jar) {
        delete jar[c.name];
        changed = true;
      }
    } else if (jar[c.name] !== c.value) {
      jar[c.name] = c.value;
      changed = true;
    }
  }
  return changed;
}

export function cookieHeader(jar: CookieJar): string {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

export function sessionOnly(jar: CookieJar): CookieJar {
  return Object.fromEntries(Object.entries(jar).filter(([k]) => isSessionCookie(k)));
}
