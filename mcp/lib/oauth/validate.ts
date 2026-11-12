// Pure OAuth checks: redirect URIs and PKCE. No imports, so node:test can load it directly.

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
const FORBIDDEN_SCHEMES = new Set(['javascript:', 'data:', 'file:', 'vbscript:', 'blob:', 'about:']);

/** https anywhere, http only on loopback (native apps), or a private-use scheme such as cursor:// or vscode://. */
export function isAllowedRedirectUri(uri: string): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.hash) return false;
  if (u.protocol === 'https:') return true;
  if (u.protocol === 'http:') return LOOPBACK.has(u.hostname);
  return /^[a-z][a-z0-9+.-]*:$/.test(u.protocol) && !FORBIDDEN_SCHEMES.has(u.protocol);
}

/** Exact match, except that loopback redirects may use any port (RFC 8252 §7.3). */
export function redirectMatches(registered: string[], requested: string): boolean {
  if (registered.includes(requested)) return true;
  let r: URL;
  try {
    r = new URL(requested);
  } catch {
    return false;
  }
  if (r.protocol !== 'http:' || !LOOPBACK.has(r.hostname)) return false;
  return registered.some((reg) => {
    try {
      const g = new URL(reg);
      return g.protocol === 'http:' && g.hostname === r.hostname && g.pathname === r.pathname && g.search === r.search;
    } catch {
      return false;
    }
  });
}

const VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/;

export async function s256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return Buffer.from(digest).toString('base64url');
}

export async function verifyPkce(verifier: string | null | undefined, challenge: string): Promise<boolean> {
  if (!verifier || !VERIFIER_RE.test(verifier)) return false;
  return (await s256(verifier)) === challenge;
}
