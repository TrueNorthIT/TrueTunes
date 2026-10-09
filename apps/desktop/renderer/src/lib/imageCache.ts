// Throttled image fetch queue + objectURL cache with LRU eviction.
// Prevents 429s when many images load at once, and revokes object URLs
// when the cache exceeds MAX_ENTRIES to avoid memory leaks.

const MAX_ENTRIES    = 200;
const MAX_CONCURRENT = 4;

// LRU: Map preserves insertion order; moving an entry to the end marks it as recently used.
const cache   = new Map<string, string>();          // url -> objectURL
const inflight = new Map<string, Promise<string | null>>(); // url -> in-flight promise
const queue: Array<() => void> = [];
let active = 0;

function evictLru(): void {
  if (cache.size < MAX_ENTRIES) return;
  // First key in a Map is the least recently used
  const lruKey = cache.keys().next().value;
  if (lruKey !== undefined) {
    const objectUrl = cache.get(lruKey)!;
    cache.delete(lruKey);
    URL.revokeObjectURL(objectUrl);
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

export function fetchImage(url: string): Promise<string | null> {
  const cached = getCached(url);
  if (cached) return Promise.resolve(cached);

  const existing = inflight.get(url);
  if (existing) return existing;

  const p = new Promise<string | null>((resolve) => {
    const run = async () => {
      active++;
      try {
        const resp = await fetch(url, { referrerPolicy: 'no-referrer' });
        if (!resp.ok) { resolve(null); return; }
        const blob = await resp.blob();
        evictLru();
        const objectUrl = URL.createObjectURL(blob);
        cache.set(url, objectUrl);
        resolve(objectUrl);
      } catch {
        // Direct fetch failed (likely CORS) — proxy through main process
        try {
          const result = await window.sonos.fetchImage(url);
          if ('error' in result) { resolve(null); return; }
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

    if (active < MAX_CONCURRENT) {
      run();
    } else {
      queue.push(run);
    }
  });

  inflight.set(url, p);
  return p;
}
