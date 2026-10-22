import { useQueries, useQuery } from '@tanstack/react-query';
import { geniusAlbumYearQueryOptions } from './useGeniusAlbumYear';
import { releaseKey } from '../lib/releaseShelves';
import { matchReleaseYears } from '../lib/releaseYears';
import type { SonosItem } from '../types/sonos';

export function geniusArtistAlbumsQueryOptions(artistName: string | null | undefined) {
  return {
    queryKey: ['genius-artist-albums', artistName] as const,
    queryFn: () => window.sonos.geniusArtistAlbums(artistName ?? ''),
    staleTime: Infinity,
    retry: false,
    enabled: !!artistName,
  };
}

/**
 * Release year per release (keyed by releaseKey): matched from the artist's Genius album list,
 * then a per-title Genius song search for whatever that list did not cover.
 */
export function useReleaseYears(releases: SonosItem[], artistName: string | null | undefined) {
  const albums = useQuery(geniusArtistAlbumsQueryOptions(artistName));
  const years = matchReleaseYears(releases, albums.data ?? []);
  // Wait for the album list so the fallback only searches for what it missed.
  const unmatched = albums.isFetched ? releases.filter((r) => !years.has(releaseKey(r))) : [];
  // ponytail: one search per unmatched release, all at once; cap concurrency if Genius rate-limits.
  // One search per title: versions that share a title (clean and explicit, say) would otherwise put the same
  // key in useQueries twice, which it warns about as "Duplicate Queries found".
  const titles = [...new Set(unmatched.map((r) => r.title))];
  const fallback = useQueries({
    queries: titles.map((t) => geniusAlbumYearQueryOptions(t, artistName)),
  });
  const byTitle = new Map(titles.map((t, i) => [t, fallback[i]?.data]));
  unmatched.forEach((r) => {
    const y = byTitle.get(r.title);
    if (typeof y === 'number') years.set(releaseKey(r), y);
  });
  return { years, isLoading: albums.isLoading || fallback.some((q) => q.isLoading) };
}
