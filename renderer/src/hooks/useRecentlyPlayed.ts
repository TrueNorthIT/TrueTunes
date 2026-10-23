import { queryOptions, useQuery, useQueries } from '@tanstack/react-query';
import { api } from '../lib/sonosApi';
import type { SonosItem } from '../types/sonos';
import { findArtistByName, getItemArt, parseServiceSearch, resolveArtistParams, artistItem } from '../lib/itemHelpers';
import { STALE, GC_HOUR } from '../lib/queryDefaults';
import { useDisplayName } from './useDisplayName';

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
  return artistItem(
    a.artist,
    {
      objectId: a.artistId ?? resolved?.artistId,
      serviceId: a.serviceId ?? resolved?.serviceId,
      accountId: a.accountId ?? resolved?.accountId,
    },
    { title: a.artist, imageUrl: resolved?.imageUrl ?? a.imageUrl }
  );
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

export const recentlyPlayedKeys = {
  user: (userId: string | null) => ['recentlyPlayed', userId] as const,
  artist: (a: RecentArtist) =>
    ['recent-artist', a.artistId ?? null, a.artist.toLowerCase(), a.serviceId ?? null, a.accountId ?? null] as const,
};

/** One person's recent tracks, albums and artists. Shared by Profile, Home and the DJ views. */
export const recentlyPlayedQueryOptions = (userId: string | null) =>
  queryOptions({
    queryKey: recentlyPlayedKeys.user(userId),
    queryFn: async () => {
      if (!userId) return null;
      return window.sonos.fetchRecentlyPlayed(userId);
    },
    enabled: !!userId,
  });

// Tiles with an artistId just need their photo. Tiles without one (featured
// artists, or old events) are resolved by name via search to get the real id
// and photo; if nothing matches exactly the tile stays id-less and the click
// handler falls back to resolveAndOpen.
export const recentArtistQueryOptions = (a: RecentArtist) =>
  queryOptions({
    queryKey: recentlyPlayedKeys.artist(a),
    queryFn: async (): Promise<ResolvedArtist | null> => {
      if (a.artistId) {
        if (!a.serviceId || !a.accountId) return null;
        const r = await api.browse.artist(a.artistId, {
          serviceId: a.serviceId,
          accountId: a.accountId,
          muse2: true,
        });
        if (r.error) return null;
        const imageUrl = r.data?.images?.tile1x1;
        return imageUrl ? { imageUrl } : null;
      }
      const r = await api.search.serviceQuery(a.artist, {
        count: 20,
        serviceId: a.serviceId,
        accountId: a.accountId,
      });
      if (r.error || !r.data) return null;
      const match = findArtistByName(parseServiceSearch(r.data), a.artist);
      if (!match) return null;
      const { artistId, serviceId, accountId } = resolveArtistParams(match);
      if (!artistId) return null;
      return { artistId, serviceId, accountId, imageUrl: getItemArt(match) ?? undefined };
    },
    staleTime: STALE.forever,
    gcTime: GC_HOUR,
  });

export function useRecentlyPlayed(selectedUserId?: string) {
  const currentUserId = useDisplayName();

  const userId = selectedUserId ?? currentUserId ?? null;

  const { data, isLoading } = useQuery(recentlyPlayedQueryOptions(userId));

  const rawArtists = data?.artists ?? [];

  const artistImageQueries = useQueries({
    queries: rawArtists.slice(0, 9).map(recentArtistQueryOptions),
  });

  return {
    artistItems: rawArtists.slice(0, 9).map((a, i) => {
      const q = artistImageQueries[i];
      return toArtistItem(a, q?.isSuccess ? q.data : undefined);
    }),
    albumItems: (data?.albums ?? []).map(toAlbumItem),
    availableUsers: data?.availableUsers ?? [],
    currentUserId: currentUserId ?? null,
    isLoading: !!userId && isLoading,
  };
}
