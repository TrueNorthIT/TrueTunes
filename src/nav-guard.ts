// Decides what happens when an app window tries to navigate or open a window.
// Kept free of Electron imports so `npm run test:main` can exercise it.

export type NavDecision = 'allow' | 'external' | 'deny';

/** True for http(s) URLs, the only kind handed to shell.openExternal. */
export function isWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** file: paths compared case-insensitively and decoded (Windows drive letters, %20 vs space). */
function filePath(u: URL): string {
  return decodeURIComponent(u.pathname).toLowerCase();
}

/**
 * `appUrl` is what the window loads: the Vite dev server origin, or the packaged
 * index.html as a file: URL. Same app (any hash or query) stays in the window,
 * other web links go to the system browser, anything else is refused.
 */
export function navDecision(target: string, appUrl: string): NavDecision {
  let t: URL;
  let app: URL;
  try {
    t = new URL(target);
    app = new URL(appUrl);
  } catch {
    return 'deny';
  }
  const sameApp =
    app.protocol === 'file:' ? t.protocol === 'file:' && filePath(t) === filePath(app) : t.origin === app.origin;
  if (sameApp) return 'allow';
  return isWebUrl(target) ? 'external' : 'deny';
}
