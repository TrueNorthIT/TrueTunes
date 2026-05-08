import { useQuery } from '@tanstack/react-query';
import type { SonosItem } from '../types/sonos';

function toArtistItem(a: RecentArtist): SonosItem {
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

function toAlbumItem(a: RecentAlbum): SonosItem {
  return {
    type: 'ITEM_ALBUM',
    title: a.album,
    name: a.artist,
    imageUrl: a.imageUrl,
    id: { objectId: a.albumId, serviceId: a.serviceId, accountId: a.accountId },
  };
}

function toTrackItem(t: RecentTrack): SonosItem {
  return {
    type: 'ITEM_TRACK',
    title: t.trackName,
    name: t.trackName,
    imageUrl: t.imageUrl,
    // Use albumId so useOpenItem's else branch navigates to the parent album
    id: { objectId: t.albumId ?? '', serviceId: t.serviceId, accountId: t.accountId },
  };
}

export function useRecentlyPlayed() {
  const { data: userId } = useQuery({
    queryKey: ['displayName'],
    queryFn: () => window.sonos.getDisplayName(),
    staleTime: Infinity,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['recentlyPlayed', userId],
    queryFn: async () => {
      if (!userId) return null;
      return window.sonos.fetchRecentlyPlayed(userId);
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });

  return {
    artistItems: (data?.artists ?? []).map(toArtistItem),
    albumItems:  (data?.albums  ?? []).map(toAlbumItem),
    trackItems:  (data?.tracks  ?? []).filter(t => t.albumId).map(toTrackItem),
    isLoading: !!userId && isLoading,
  };
}
