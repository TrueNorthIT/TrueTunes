import { useQueries } from '@tanstack/react-query';

/**
 * Recent tracks and albums per person, from one request each. Same key and fetcher as
 * useRecentlyPlayed, so the cache is shared.
 */
export function useRecentTracksByUser(userIds: string[], enabled = true) {
  const results = useQueries({
    queries: userIds.map((userId) => ({
      queryKey: ['recentlyPlayed', userId],
      queryFn: () => window.sonos.fetchRecentlyPlayed(userId),
      enabled,
      staleTime: 5 * 60 * 1000,
    })),
  });
  const tracksByUser = new Map<string, RecentTrack[]>();
  const albumsByUser = new Map<string, RecentAlbum[]>();
  userIds.forEach((id, i) => {
    tracksByUser.set(id, results[i]?.data?.tracks ?? []);
    albumsByUser.set(id, results[i]?.data?.albums ?? []);
  });
  return { tracksByUser, albumsByUser };
}
