import { useQueries } from '@tanstack/react-query';
import { albumQueryOptions } from './useAlbumBrowse';
import { releaseKey } from '../lib/releaseShelves';
import type { SonosItem } from '../types/sonos';

/**
 * Track titles per release (keyed by releaseKey), for searching inside releases. Uses the full album
 * query so the ['album', id] cache is shared with the album page. Nothing is fetched until `enabled`.
 */
export function useReleaseTracklists(releases: SonosItem[], enabled: boolean) {
  // one query per id: the same key twice in useQueries trips its "Duplicate Queries found" warning
  const withId = [...new Map(releases.filter((r) => r.resource?.id?.objectId).map((r) => [r.resource?.id?.objectId, r])).values()];
  // ponytail: all requests fire at once; cap concurrency if the BFF rate-limits.
  const results = useQueries({
    queries: withId.map((r) => {
      const { objectId, serviceId, accountId } = r.resource?.id ?? {};
      const opts = albumQueryOptions(objectId, serviceId, accountId, r.resource?.defaults);
      return {
        ...opts,
        enabled,
        retry: false,
        select: (d: { tracks: { title: string }[] }) => d.tracks.map((t) => t.title),
      };
    }),
  });

  const tracksByRelease = new Map<string, string[]>();
  results.forEach((q, i) => {
    if (q.data) tracksByRelease.set(releaseKey(withId[i]), q.data);
  });
  return { tracksByRelease, isLoading: enabled && results.some((q) => q.isLoading) };
}
