// The True Tunes web app's service worker. A classic script (no imports), served as /sw.js with `no-cache`.
// vite.web.config.ts copies it into the build with BUILD filled in, so every build is a different file and the
// browser sees a new version.
//
// What it does:
//   - keeps the app shell (index.html, the manifest, the icons) and hashed /assets/ files, so the installed app
//     opens at once and opens offline;
//   - nothing else. It never answers or stores a request to /sonos, /fn, /img, /healthz or /auth, a request to
//     another origin, a request that is not a GET, or any request carrying Authorization. Those go to the
//     network untouched, every time.
//   - a new version installs beside the running one and WAITS. It takes over when the page says so (the app's
//     Update button), at launch if the app has just been opened and this is its only window, or when every
//     window of the old version has closed. Never under someone who is in the middle of using it.
//
// __tests__/sw.test.ts runs this file against fake events; keep `route` the one place that decides.

/* global self, caches, fetch, URL, Response */

const BUILD = /*__BUILD__*/ { id: 'dev', version: 'dev', shell: [] };
const CACHE = `true-tunes-${BUILD.id}`;
const SHELL = '/index.html';
/** Paths that are the API, the relay or the way back from sign-in: never ours to answer. */
const NEVER = /^\/(sonos|fn|img|healthz|auth)(\/|$)/;

/**
 * What to do with a request: 'shell' (a page load: the cached app shell), 'asset' (a hashed build file: cache
 * first), 'precached' (the manifest or an icon), or null (leave it to the network, store nothing).
 */
function route(request) {
  if (request.method !== 'GET') return null;
  if (request.headers.has('authorization')) return null;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return null;
  if (NEVER.test(url.pathname)) return null;
  if (request.mode === 'navigate') return 'shell';
  if (url.pathname.startsWith('/assets/')) return 'asset';
  if (BUILD.shell.includes(url.pathname)) return 'precached';
  return null;
}

self.addEventListener('install', (event) => {
  // `reload` bypasses the HTTP cache, so the shell stored is the one this build shipped with.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([SHELL, ...BUILD.shell].map((path) => new Request(path, { cache: 'reload' }))))
  );
  // No skipWaiting here: the running version keeps the page until the user takes the update.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith('true-tunes-') && k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'activate') void self.skipWaiting();
  // Asked at launch: take over only if that page is the one open window, so no other session reloads under its user.
  if (event.data === 'activate-if-alone') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
        if (windows.length <= 1) return self.skipWaiting();
      })
    );
  }
  if (event.data === 'version') event.ports[0]?.postMessage(BUILD.version);
});

async function cacheFirst(request, key) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(key ?? request);
  if (hit) return hit;
  const response = await fetch(request);
  // Only a plain, complete, same-origin 200 is kept.
  if (key === undefined && response.ok && response.status === 200 && response.type === 'basic') {
    void cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const plan = route(event.request);
  if (!plan) return;
  if (plan === 'shell') {
    // The shell this version was installed with, whatever the path (/, /demo): the app routes in the page.
    event.respondWith(cacheFirst(event.request, SHELL).catch(() => Response.error()));
  } else {
    event.respondWith(cacheFirst(event.request));
  }
});
