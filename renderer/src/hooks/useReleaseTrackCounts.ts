import { useQueries } from '@tanstack/react-query';
import { albumQueryOptions } from './useAlbumBrowse';
import { releaseKey, releaseLabel } from '../lib/releaseShelves';
import type { SonosItem } from '../types/sonos';

/**
 * Track count per release (keyed by releaseKey), only for releases the service did not label
 * Album/Single/EP. Uses the full album query so the ['album', id] cache is shared with the album page.
 */
export function useReleaseTrackCounts(releases: SonosItem[]) {
  const unlabelled = releases.filter((r) => releaseLabel(r) === 'unknown' && r.resource?.id?.objectId);
  // ponytail: all requests fire at once; cap concurrency if the BFF rate-limits.
  const results = useQueries({
    queries: unlabelled.map((r) => {
      const { objectId, serviceId, accountId } = r.resource?.id ?? {};
      const opts = albumQueryOptions(objectId, serviceId, accountId, r.resource?.defaults);
      return {
        ...opts,
        select: (d: { tracks: unknown[] }) => d.tracks.length, // same cache entry as the album page
        retry: false,
      };
    }),
  });

  const counts = new Map<string, number>();
  results.forEach((q, i) => {
    if (typeof q.data === 'number') counts.set(releaseKey(unlabelled[i]), q.data);
  });
  return { counts, isLoading: results.some((q) => q.isLoading) };
}
