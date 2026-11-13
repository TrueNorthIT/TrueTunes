// The browser-side half of the demo. It runs on the production origin beside the real signed-in app, so unlike
// installMockRuntime it must not touch the real localStorage; it also leaves the clock running and motion alone.

import { artSvg, seedOfArtUrl } from '../../test/fixtures/art';
import { lyrics } from '../../test/fixtures/azure';
import { FROZEN_NOW } from '../../test/fixtures/time';
import { disposeDemoBackends } from './backend';

/** A `Storage` that lives and dies with the page. */
class MemoryStorage implements Storage {
  private readonly data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(String(key), String(value));
  }
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

/** The gateway's own paths: the real office, even on this origin (sonos, fn, img, and the pubsub relay). */
const GATEWAY_PATH = /^\/(sonos|fn|img|pubsub)(\/|$)/;

function demoFetch(real: typeof fetch): typeof fetch {
  return (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const seed = seedOfArtUrl(url);
    if (seed !== null) {
      return Promise.resolve(new Response(artSvg(seed), { headers: { 'Content-Type': 'image/svg+xml' } }));
    }
    if (url.startsWith('https://lrclib.net/api/get')) {
      return Promise.resolve(json(lyrics(Number(new URL(url).searchParams.get('duration') ?? 200))));
    }
    if (url.startsWith('https://lrclib.net/api/search')) return Promise.resolve(json([lyrics(200)]));
    // Same-origin, data: and blob: URLs pass; any other host would be a real network call.
    if (/^(https?|wss?):\/\//i.test(url) && new URL(url).origin !== window.location.origin) {
      return Promise.reject(new TypeError(`Blocked by the demo backend: ${url}`));
    }
    // The gateway's own API paths are the real office, even on this origin.
    if (GATEWAY_PATH.test(new URL(url, window.location.href).pathname)) {
      return Promise.reject(new TypeError(`Blocked by the demo backend: ${url}`));
    }
    return real(input, init);
  };
}

/** Swap the browser's clock, storage and network for the demo's. Returns the undo. */
export function installDemoRuntime(): () => void {
  const RealDate = Date;
  const installedAt = RealDate.now();
  const demoNow = () => FROZEN_NOW + (RealDate.now() - installedAt);
  /** `new Date()` and `Date.now()` run from the fixtures' instant; dates built from arguments work as normal. */
  class DemoDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(demoNow());
      else super(...(args as [number]));
    }
    static override now() {
      return demoNow();
    }
  }

  const realFetch = window.fetch;
  const realWebSocket = window.WebSocket;
  const realStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');
  const realSession = Object.getOwnPropertyDescriptor(window, 'sessionStorage');

  const hold = (key: 'localStorage' | 'sessionStorage') =>
    Object.defineProperty(window, key, { configurable: true, value: new MemoryStorage() });
  hold('localStorage');
  hold('sessionStorage');
  globalThis.Date = DemoDate as unknown as DateConstructor;
  window.fetch = demoFetch(realFetch.bind(window));
  // Nothing in the demo may open a socket to another host (the real Sonos gateway is one).
  window.WebSocket = new Proxy(realWebSocket, {
    construct(target, args: ConstructorParameters<typeof WebSocket>) {
      const to = new URL(String(args[0]), window.location.href);
      if (to.host !== window.location.host || GATEWAY_PATH.test(to.pathname)) {
        throw new DOMException(`Blocked by the demo backend: ${String(args[0])}`, 'SecurityError');
      }
      return Reflect.construct(target, args);
    },
  });

  return () => {
    disposeDemoBackends();
    globalThis.Date = RealDate;
    window.fetch = realFetch;
    window.WebSocket = realWebSocket;
    const restore = (key: 'localStorage' | 'sessionStorage', d?: PropertyDescriptor) => {
      if (d) Object.defineProperty(window, key, d);
      else Reflect.deleteProperty(window, key);
    };
    restore('localStorage', realStorage);
    restore('sessionStorage', realSession);
  };
}
