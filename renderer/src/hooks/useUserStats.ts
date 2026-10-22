import { useQuery } from '@tanstack/react-query';
import { statsArtistToItem, statsAlbumToItem } from '../lib/homeData';

export function useUserStats(userName: string | undefined, count?: number) {
  const { data, isLoading } = useQuery<StatsResult>({
    queryKey: ['stats', 'alltime', userName ?? null, count ?? 10],
    queryFn: () => window.sonos.fetchStats('alltime', userName, count),
    enabled: !!userName,
    staleTime: 5 * 60_000,
  });

  return {
    topTracks:   data?.topTracks  ?? [],
    artistItems: (data?.topArtists ?? []).map(statsArtistToItem),
    albumItems:  (data?.topAlbums  ?? []).map(statsAlbumToItem),
    totalEvents: data?.totalEvents ?? 0,
    isLoading:   !!userName && isLoading,
  };
}
