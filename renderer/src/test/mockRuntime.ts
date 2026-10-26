// The browser-side half of the mock backend: a frozen clock, reduced motion, and a `fetch` that answers the app's few direct network
// calls (artwork, LRCLIB lyrics) from the invented catalogue and refuses every other external URL. Installed for the
// life of a mock story and then undone. Nothing here imports vitest or storybook.

import { artSvg, seedOfArtUrl } from './fixtures/art';
import { lyrics } from './fixtures/azure';
import { FROZEN_NOW } from './fixtures/time';

const RealDate = Date;

/** `new Date()` and `Date.now()` give the frozen instant; dates built from arguments work as normal. */
class FrozenDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(FROZEN_NOW);
    else super(...(args as [number]));
  }
  static override now() {
    return FROZEN_NOW;
  }
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

function mockFetch(real: typeof fetch): typeof fetch {
  return (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const seed = seedOfArtUrl(url);
    if (seed !== null) {
      return Promise.resolve(new Response(artSvg(seed), { headers: { 'Content-Type': 'image/svg+xml' } }));
    }
    if (url.startsWith('https://lrclib.net/api/get')) {
      const secs = Number(new URL(url).searchParams.get('duration') ?? 200);
      return Promise.resolve(json(lyrics(secs)));
    }
    if (url.startsWith('https://lrclib.net/api/search')) return Promise.resolve(json([lyrics(200)]));
    // Same-origin (Storybook's own modules), data: and blob: URLs pass; any other host is a real network call.
    if (/^https?:\/\//i.test(url) && new URL(url).origin !== window.location.origin) {
      return Promise.reject(new TypeError(`Blocked by the Storybook mock backend: ${url}`));
    }
    return real(input, init);
  };
}

/** Reports `prefers-reduced-motion: reduce`, so scripted motion (a smooth scroll to the active lyric) jumps instead. */
function reducedMotion(real: typeof window.matchMedia): typeof window.matchMedia {
  return (query) => {
    const mql = real(query);
    if (/prefers-reduced-motion:\s*reduce/.test(query)) Object.defineProperty(mql, 'matches', { value: true });
    return mql;
  };
}

/** Freeze the clock, serve the mock network and start from empty local storage. Returns the undo. */
export function installMockRuntime(): () => void {
  const realFetch = window.fetch;
  const realMatchMedia = window.matchMedia;
  const clearStorage = () => {
    try {
      localStorage.clear();
    } catch {
      /* storage blocked: the pages cope without it */
    }
  };
  clearStorage();
  globalThis.Date = FrozenDate as unknown as DateConstructor;
  window.fetch = mockFetch(realFetch.bind(window));
  window.matchMedia = reducedMotion(realMatchMedia.bind(window));
  return () => {
    globalThis.Date = RealDate;
    window.fetch = realFetch;
    window.matchMedia = realMatchMedia;
    clearStorage();
  };
}
