import { useEffect, useSyncExternalStore } from 'react';

// The artwork of the page currently on screen (artist hero, album cover), for the ambient backdrop.
// A page registers its already-cached image URL; nothing is fetched here.
let current: string | null = null;
const listeners = new Set<() => void>();

function set(url: string | null) {
  if (url === current) return;
  current = url;
  listeners.forEach((l) => l());
}

/** Register this page's artwork while it is mounted. */
export function usePageArt(url: string | null) {
  useEffect(() => {
    set(url);
    return () => set(null);
  }, [url]);
}

export function usePageArtValue(): string | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}
