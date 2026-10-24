import { useQueries } from '@tanstack/react-query';
import { recentlyPlayedQueryOptions } from './useRecentlyPlayed';

/**
 * Recent tracks and albums per person, from one request each. Same options as
 * useRecentlyPlayed, so the cache is shared.
 */
export function useRecentTracksByUser(userIds: string[], enabled = true) {
  const results = useQueries({
    queries: userIds.map((userId) => ({ ...recentlyPlayedQueryOptions(userId), enabled })),
  });
  const tracksByUser = new Map<string, RecentTrack[]>();
  const albumsByUser = new Map<string, RecentAlbum[]>();
  userIds.forEach((id, i) => {
    tracksByUser.set(id, results[i]?.data?.tracks ?? []);
    albumsByUser.set(id, results[i]?.data?.albums ?? []);
  });
  return { tracksByUser, albumsByUser };
}
