// The web app's "a new version is ready": the service worker (renderer/web/sw.js). A new build installs beside
// the running one and waits.
//   - Found while the app is launching (the first seconds of a page load, before the user has touched anything,
//     and with no other window open): it takes over at once and the page reloads onto it, so opening the app
//     gets the latest version.
//   - Found later, or with another window open: the app's Update button (through the bridge's update events)
//     tells it to take over. Nothing reloads under someone who is using the app.

import type { UpdateSource } from './bridge/types';

/** How often a long-open page asks whether a new build has shipped (the desktop's updater polls on the same beat). */
const CHECK_EVERY_MS = 15 * 60_000;
/** How long after a page load still counts as launching. */
const LAUNCH_MS = 10_000;
/** How long the worker gets to take over at launch before the Update button is offered instead. */
const TAKE_OVER_MS = 1500;

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
    // When a new worker takes over (this window's Update button, or another window's), the old version's cached
    // files go with it: reload onto the new one. A page that started with no worker gets its first one from the
    // very first install, which replaces nothing, so that one change is let pass.
    let controlled = !!sw.controller;
    sw.addEventListener('controllerchange', () => {
      if (controlled) location.reload();
      controlled = true;
    });

    // Launching: the page has just loaded and nobody has tapped or typed yet.
    let touched = false;
    const touch = () => void (touched = true);
    window.addEventListener('pointerdown', touch, { once: true, capture: true });
    window.addEventListener('keydown', touch, { once: true, capture: true });
    const launching = () => !touched && performance.now() < LAUNCH_MS;

    const announce = (worker: ServiceWorker) => {
      waiting = worker;
      void versionOf(worker).then((v) => {
        version = v;
        listeners.forEach((cb) => cb(v));
      });
    };

    void sw
      .register('/sw.js')
      .then((registration) => {
        /** A new version is installed and waiting. `atLaunch`: it was found while the app was launching. */
        const ready = (worker: ServiceWorker, atLaunch: boolean) => {
          // The very first install replaces nothing, so it is not an update.
          if (!sw.controller) return;
          if (!atLaunch || touched) return announce(worker);
          // The worker takes over only if this is the app's one window; if it does not, offer the button.
          worker.postMessage('activate-if-alone');
          setTimeout(() => {
            if (worker.state === 'installed') announce(worker);
          }, TAKE_OVER_MS);
        };
        const watch = (next: ServiceWorker | null) => {
          const atLaunch = launching();
          next?.addEventListener('statechange', () => {
            if (next.state === 'installed') ready(next, atLaunch);
          });
        };
        if (registration.waiting) ready(registration.waiting, launching());
        // One may already be installing when the registration resolves.
        watch(registration.installing);
        registration.addEventListener('updatefound', () => watch(registration.installing));
        const check = () => void registration.update().catch(() => {});
        check();
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
