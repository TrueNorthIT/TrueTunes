import { useEffect, useState } from 'react';
import { getCached, fetchImage, retainImage, releaseImage } from '../lib/imageCache';

export function useImage(url: string | null | undefined): string | null {
  const [src, setSrc] = useState<string | null>(() => (url ? getCached(url) : null));

  /* eslint-disable react-hooks/set-state-in-effect -- mirrors the module-level image cache (an external store), whose
     hits are synchronous and mutate LRU order, so they can't be read during render */
  useEffect(() => {
    if (!url) {
      setSrc(null);
      return;
    }
    // Hit synchronously first (may already be cached from a prior render)
    const cached = getCached(url);
    if (cached) {
      setSrc(cached);
      return;
    }

    // Clear immediately so the stale image doesn't linger while the new one loads
    setSrc(null);
    let cancelled = false;
    void fetchImage(url).then((objectUrl) => {
      if (!cancelled) setSrc(objectUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Pin the cached blob while this consumer shows it, so LRU eviction can't revoke it under a lazy-decoding <img>.
  useEffect(() => {
    if (!url || !src) return;
    retainImage(url);
    return () => releaseImage(url);
  }, [url, src]);

  return src;
}
