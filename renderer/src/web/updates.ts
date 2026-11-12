// The web app's "a new version is ready": the service worker (renderer/web/sw.js). A new build installs beside
// the running one and waits; the app's Update button (through the bridge's update events) tells it to take over,
// and the page reloads onto it. Nothing here activates a version on its own.

import type { UpdateSource } from './bridge/types';

/** How often a long-open page asks whether a new build has shipped (the desktop's updater polls on the same beat). */
const CHECK_EVERY_MS = 15 * 60_000;

function versionOf(worker: ServiceWorker): Promise<string> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve('new'), 2000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(typeof event.data === 'string' && event.data ? event.data : 'new');
    };
    worker.postMessage('version', [channel.port2]);
  });
}

export function createUpdates(): UpdateSource {
  const listeners = new Set<(version: string) => void>();
  let waiting: ServiceWorker | null = null;
  let version: string | null = null;

  const sw = 'serviceWorker' in navigator ? navigator.serviceWorker : null;
  // Not in dev: the dev server's modules must never be cached.
  if (sw && import.meta.env.PROD) {
    // If another window takes the update, this one's cached files go with the old version: follow it.
    if (sw.controller) sw.addEventListener('controllerchange', () => location.reload());

    const announce = (worker: ServiceWorker) => {
      // The very first install replaces nothing, so it is not an update.
      if (!sw.controller) return;
      waiting = worker;
      void versionOf(worker).then((v) => {
        version = v;
        listeners.forEach((cb) => cb(v));
      });
    };

    void sw
      .register('/sw.js')
      .then((registration) => {
        if (registration.waiting) announce(registration.waiting);
        registration.addEventListener('updatefound', () => {
          const next = registration.installing;
          next?.addEventListener('statechange', () => {
            if (next.state === 'installed') announce(next);
          });
        });
        const check = () => void registration.update().catch(() => {});
        setInterval(check, CHECK_EVERY_MS);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') check();
        });
      })
      .catch(() => {
        /* no service worker (private mode, blocked): the app works, it just is not installable or offline-capable */
      });
  }

  return {
    onWaiting(cb) {
      listeners.add(cb);
      const known = version;
      if (known) queueMicrotask(() => listeners.has(cb) && cb(known));
      return () => void listeners.delete(cb);
    },
    activate() {
      // Never settles: the page reloads onto the new version (the controllerchange listener above).
      return new Promise<void>(() => {
        if (waiting) waiting.postMessage('activate');
        else location.reload();
      });
    },
  };
}
