// Throttled image fetch queue + objectURL cache with LRU eviction.
// Prevents 429s when many images load at once, and revokes object URLs
// when the cache exceeds MAX_ENTRIES to avoid memory leaks.

const MAX_ENTRIES = 200;
const MAX_CONCURRENT = 4;

// LRU: Map preserves insertion order; moving an entry to the end marks it as recently used.
const cache = new Map<string, string>(); // url -> objectURL
const inflight = new Map<string, Promise<string | null>>(); // url -> in-flight promise
const queue: Array<() => void> = [];
let active = 0;

// Mounted consumers (see useImage) hold their URL here; evicting one would break an <img> that is still showing it.
const holds = new Map<string, number>();

export function retainImage(url: string): void {
  holds.set(url, (holds.get(url) ?? 0) + 1);
}

export function releaseImage(url: string): void {
  const n = (holds.get(url) ?? 0) - 1;
  if (n > 0) holds.set(url, n);
  else holds.delete(url);
}

function evictLru(): void {
  if (cache.size < MAX_ENTRIES) return;
  // First key in a Map is the least recently used; skip any still held by a consumer.
  // ponytail: if every entry is held the cache grows past MAX_ENTRIES until something is released.
  for (const [key, objectUrl] of cache) {
    if (holds.has(key)) continue;
    cache.delete(key);
    URL.revokeObjectURL(objectUrl);
    return;
  }
}

function drain() {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    queue.shift()!();
  }
}

export function getCached(url: string): string | null {
  const objectUrl = cache.get(url);
  if (!objectUrl) return null;
  // Refresh LRU position
  cache.delete(url);
  cache.set(url, objectUrl);
  return objectUrl;
}

/** "https://…/abc=w226-h226-l90-rj" → "https://…/abc"; null for a URL without a size spec. */
function artworkBase(url: string): string | null {
  const i = url.search(/=w\d+-h\d+/);
  return i > 0 ? url.slice(0, i) : null;
}

/** Smallest copy worth showing in a hero while the full size loads: smaller ones are a blur and too small to find faces in. */
const MIN_VARIANT_WIDTH = 200;

/**
 * The largest copy of the same artwork already loaded at another size ("=w544-h544" while "=w2000-h2000" is asked
 * for), or null. The image service takes about two seconds to produce any size it has not served before, so a hero
 * shows this copy at once and sharpens when the full size arrives.
 */
export function getCachedVariant(url: string): string | null {
  const base = artworkBase(url);
  if (!base) return null;
  let best: { w: number; objectUrl: string } | null = null;
  for (const [key, objectUrl] of cache) {
    if (key === url || artworkBase(key) !== base) continue;
    const w = Number(/=w(\d+)/.exec(key)?.[1] ?? 0);
    if (w >= MIN_VARIANT_WIDTH && (!best || w > best.w)) best = { w, objectUrl };
  }
  return best?.objectUrl ?? null;
}

/**
 * `priority` starts at once, outside the concurrency cap: for the one image a page waits on (the artist hero), not
 * for tiles. Jumping the queue alone still left it waiting for one of the four slots held by large tile downloads.
 */
export function fetchImage(url: string, priority = false): Promise<string | null> {
  const cached = getCached(url);
  if (cached) return Promise.resolve(cached);

  const existing = inflight.get(url);
  if (existing) return existing;

  const p = new Promise<string | null>((resolve) => {
    const run = async () => {
      active++;
      try {
        const resp = await fetch(url, { referrerPolicy: 'no-referrer' });
        if (!resp.ok) {
          resolve(null);
          return;
        }
        const blob = await resp.blob();
        evictLru();
        const objectUrl = URL.createObjectURL(blob);
        cache.set(url, objectUrl);
        resolve(objectUrl);
      } catch {
        // Direct fetch failed (likely CORS) — proxy through main process
        try {
          const result = await window.sonos.fetchImage(url);
          if ('error' in result) {
            resolve(null);
            return;
          }
          const binary = atob(result.data);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const blob = new Blob([bytes], { type: result.mimeType });
          evictLru();
          const objectUrl = URL.createObjectURL(blob);
          cache.set(url, objectUrl);
          resolve(objectUrl);
        } catch {
          resolve(null);
        }
      } finally {
        active--;
        inflight.delete(url);
        drain();
      }
    };

    if (priority || active < MAX_CONCURRENT) {
      void run();
    } else {
      queue.push(() => void run());
    }
  });

  inflight.set(url, p);
  return p;
}
