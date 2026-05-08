import { useQuery, useQueries } from '@tanstack/react-query';
import { api } from '../lib/sonosApi';
import type { SonosItem } from '../types/sonos';
import type { ArtistResponse } from '../types/ArtistResponse';

function relativeDate(ts: number): string {
  const diffMs = Date.now() - ts;
  const days = Math.floor(diffMs / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return '1 week ago';
  return `${Math.floor(days / 7)} weeks ago`;
}

function toArtistItem(a: RecentArtist, imageUrl?: string | null): SonosItem {
  return {
    type: 'ARTIST',
    title: a.artist,
    name: a.artist,
    imageUrl: imageUrl ?? a.imageUrl,
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
    name: a.album,
    artist: a.artist,
    imageUrl: a.imageUrl,
    id: { objectId: a.albumId, serviceId: a.serviceId, accountId: a.accountId },
    summary: { content: `${a.artist} • ${relativeDate(a.lastPlayed)}` },
  };
}

export function useRecentlyPlayed(selectedUserId?: string) {
  const { data: currentUserId } = useQuery({
    queryKey: ['displayName'],
    queryFn: () => window.sonos.getDisplayName(),
    staleTime: Infinity,
  });

  const userId = selectedUserId ?? currentUserId ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ['recentlyPlayed', userId],
    queryFn: async () => {
      if (!userId) return null;
      return window.sonos.fetchRecentlyPlayed(userId);
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });

  const rawArtists = data?.artists ?? [];

  const artistImageQueries = useQueries({
    queries: rawArtists.slice(0, 9).map((a) => ({
      queryKey: ['artist-image', a.artistId],
      queryFn: async (): Promise<string | null> => {
        if (!a.artistId || !a.serviceId || !a.accountId) return null;
        const r = await api.browse.artist(a.artistId, {
          serviceId: a.serviceId,
          accountId: a.accountId,
          muse2: true,
        });
        if (r.error) return null;
        return (r.data as ArtistResponse).images?.tile1x1 ?? null;
      },
      staleTime: Infinity,
      gcTime: 60 * 60 * 1000,
      enabled: !!a.artistId && !!a.serviceId && !!a.accountId,
    })),
  });

  return {
    artistItems: rawArtists.slice(0, 9).map((a, i) => {
      const q = artistImageQueries[i];
      return toArtistItem(a, q?.isSuccess ? (q.data ?? undefined) : undefined);
    }),
    albumItems:  (data?.albums ?? []).map(toAlbumItem),
    availableUsers: data?.availableUsers ?? [],
    currentUserId: currentUserId ?? null,
    isLoading: !!userId && isLoading,
  };
}
