import { useEffect, useState } from 'react';
import { getCached, fetchImage } from '../lib/imageCache';

export function useImage(url: string | null | undefined): string | null {
  const [src, setSrc] = useState<string | null>(() => (url ? getCached(url) : null));

  useEffect(() => {
    if (!url) { setSrc(null); return; }
    // Hit synchronously first (may already be cached from a prior render)
    const cached = getCached(url);
    if (cached) { setSrc(cached); return; }

    let cancelled = false;
    fetchImage(url).then((objectUrl) => {
      if (!cancelled) setSrc(objectUrl);
    });
    return () => { cancelled = true; };
  }, [url]);

  return src;
}
