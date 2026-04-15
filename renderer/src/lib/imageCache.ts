// Throttled image fetch queue + objectURL cache.
// Prevents 429s when many images load at once.

const cache = new Map<string, string>();          // url -> objectURL
const inflight = new Map<string, Promise<string | null>>(); // url -> in-flight promise
const queue: Array<() => void> = [];
const MAX_CONCURRENT = 4;
let active = 0;

function drain() {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    queue.shift()!();
  }
}

export function getCached(url: string): string | null {
  return cache.get(url) ?? null;
}

export function fetchImage(url: string): Promise<string | null> {
  const cached = cache.get(url);
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
        const objectUrl = URL.createObjectURL(blob);
        cache.set(url, objectUrl);
        resolve(objectUrl);
      } catch {
        resolve(null);
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
