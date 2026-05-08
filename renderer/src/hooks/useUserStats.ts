import { useQuery } from '@tanstack/react-query';
import type { SonosItem } from '../types/sonos';

function toArtistItem(a: StatsArtist): SonosItem {
  return {
    type: 'ARTIST',
    title: a.artist,
    name: a.artist,
    imageUrl: a.imageUrl,
    resource: {
      type: 'ARTIST',
      id: { objectId: a.artistId, serviceId: a.serviceId, accountId: a.accountId },
    },
  };
}

function toAlbumItem(a: StatsAlbum): SonosItem {
  return {
    type: 'ITEM_ALBUM',
    title: a.album,
    name: a.album,
    artist: a.artist,
    imageUrl: a.imageUrl,
    id: { objectId: a.albumId, serviceId: a.serviceId, accountId: a.accountId },
    summary: { content: a.artist },
  };
}

export function useUserStats(userName: string | undefined, count?: number) {
  const { data, isLoading } = useQuery<StatsResult>({
    queryKey: ['stats', 'alltime', userName ?? null, count ?? 10],
    queryFn: () => window.sonos.fetchStats('alltime', userName, count),
    enabled: !!userName,
    staleTime: 5 * 60_000,
  });

  return {
    topTracks:   data?.topTracks  ?? [],
    artistItems: (data?.topArtists ?? []).map(toArtistItem),
    albumItems:  (data?.topAlbums  ?? []).map(toAlbumItem),
    totalEvents: data?.totalEvents ?? 0,
    isLoading:   !!userName && isLoading,
  };
}
