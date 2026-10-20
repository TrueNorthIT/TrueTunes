import { useQuery, useQueries } from '@tanstack/react-query';
import { api } from '../lib/sonosApi';
import type { SonosItem } from '../types/sonos';
import type { ArtistResponse } from '../types/ArtistResponse';
import type { ServiceSearch } from '../types/ServiceSearch';
import { findArtistByName, getItemArt, parseServiceSearch, resolveArtistParams } from '../lib/itemHelpers';

interface ResolvedArtist {
  artistId?: string;
  serviceId?: string;
  accountId?: string;
  imageUrl?: string;
}

function relativeDate(ts: number): string {
  const diffMs = Date.now() - ts;
  const days = Math.floor(diffMs / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return '1 week ago';
  return `${Math.floor(days / 7)} weeks ago`;
}

function toArtistItem(a: RecentArtist, resolved?: ResolvedArtist | null): SonosItem {
  return {
    type: 'ARTIST',
    title: a.artist,
    name: a.artist,
    imageUrl: resolved?.imageUrl ?? a.imageUrl,
    resource: {
      type: 'ARTIST',
      id: {
        objectId: a.artistId ?? resolved?.artistId,
        serviceId: a.serviceId ?? resolved?.serviceId,
        accountId: a.accountId ?? resolved?.accountId,
      },
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

  // Tiles with an artistId just need their photo. Tiles without one (featured
  // artists, or old events) are resolved by name via search to get the real id
  // and photo; if nothing matches exactly the tile stays id-less and the click
  // handler falls back to resolveAndOpen.
  const artistImageQueries = useQueries({
    queries: rawArtists.slice(0, 9).map((a) => ({
      queryKey: ['recent-artist', a.artistId ?? null, a.artist.toLowerCase(), a.serviceId ?? null, a.accountId ?? null],
      queryFn: async (): Promise<ResolvedArtist | null> => {
        if (a.artistId) {
          if (!a.serviceId || !a.accountId) return null;
          const r = await api.browse.artist(a.artistId, {
            serviceId: a.serviceId,
            accountId: a.accountId,
            muse2: true,
          });
          if (r.error) return null;
          const imageUrl = (r.data as ArtistResponse).images?.tile1x1;
          return imageUrl ? { imageUrl } : null;
        }
        const r = await api.search.serviceQuery(a.artist, {
          count: 20,
          serviceId: a.serviceId,
          accountId: a.accountId,
        });
        if (r.error) return null;
        const match = findArtistByName(parseServiceSearch(r.data as ServiceSearch), a.artist);
        if (!match) return null;
        const { artistId, serviceId, accountId } = resolveArtistParams(match);
        if (!artistId) return null;
        return { artistId, serviceId, accountId, imageUrl: getItemArt(match) ?? undefined };
      },
      staleTime: Infinity,
      gcTime: 60 * 60 * 1000,
    })),
  });

  return {
    artistItems: rawArtists.slice(0, 9).map((a, i) => {
      const q = artistImageQueries[i];
      return toArtistItem(a, q?.isSuccess ? q.data : undefined);
    }),
    albumItems:  (data?.albums ?? []).map(toAlbumItem),
    availableUsers: data?.availableUsers ?? [],
    currentUserId: currentUserId ?? null,
    isLoading: !!userId && isLoading,
  };
}
