import { useCallback } from 'react';
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE } from '../lib/queryDefaults';
import { useToast } from '../components/common/Toast';

export const playlistKeys = {
  owned: (userName: string | null | undefined) => ['playlists', 'owned', userName] as const,
  joined: (userName: string | null | undefined) => ['playlists', 'joined', userName] as const,
  detail: (id: string | undefined) => ['playlist', id] as const,
  favouritesEnsure: (userName: string | null | undefined) => ['favourites-ensure', userName] as const,
};

export const ensureFavouritesQueryOptions = (userName: string | null | undefined) =>
  queryOptions({
    queryKey: playlistKeys.favouritesEnsure(userName),
    queryFn: (): Promise<PlaylistDoc> => window.sonos.ensureFavourites(),
    enabled: !!userName,
    gcTime: Infinity,
    retry: 2,
  });

export function useEnsureFavourites(userName: string | null | undefined) {
  return useQuery(ensureFavouritesQueryOptions(userName));
}

export function favouritesId(userName: string) {
  return `fav-${userName}`;
}

async function safeFetchPlaylists(filter: { owner?: string; member?: string }): Promise<PlaylistMeta[]> {
  const result = await window.sonos.fetchPlaylists(filter);
  return Array.isArray(result) ? result : [];
}

export const ownedPlaylistsQueryOptions = (userName: string | null | undefined) =>
  queryOptions({
    queryKey: playlistKeys.owned(userName),
    queryFn: () => safeFetchPlaylists({ owner: userName! }),
    enabled: !!userName,
    staleTime: STALE.twoMinutes,
  });

export const joinedPlaylistsQueryOptions = (userName: string | null | undefined) =>
  queryOptions({
    queryKey: playlistKeys.joined(userName),
    queryFn: () => safeFetchPlaylists({ member: userName! }),
    enabled: !!userName,
    staleTime: STALE.twoMinutes,
  });

export function useMyPlaylists(userName: string | null | undefined) {
  const owned = useQuery(ownedPlaylistsQueryOptions(userName));
  const joined = useQuery(joinedPlaylistsQueryOptions(userName));
  return {
    owned: owned.data ?? [],
    joined: joined.data ?? [],
    isLoading: owned.isLoading || joined.isLoading,
    refetch: () => {
      void owned.refetch();
      void joined.refetch();
    },
  };
}

export const playlistQueryOptions = (id: string | undefined) =>
  queryOptions({
    queryKey: playlistKeys.detail(id),
    queryFn: async (): Promise<PlaylistDoc> => {
      const result = await window.sonos.fetchPlaylist(id!);
      if (!result || typeof result !== 'object' || 'error' in result) throw new Error('playlist not found');
      return result as PlaylistDoc;
    },
    enabled: !!id,
    staleTime: STALE.minute,
  });

export function usePlaylist(id: string | undefined) {
  return useQuery(playlistQueryOptions(id));
}

interface FavTrack {
  uri: string | null | undefined;
  trackName: string | undefined;
  artist: string | undefined;
  albumName?: string | undefined;
  imageUrl?: string | null;
  serviceId: string | null | undefined;
  accountId: string | null | undefined;
}

export function useFavourite(displayName: string | null | undefined, track: FavTrack | null) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const favId = displayName ? favouritesId(displayName) : null;

  const { data: playlist } = usePlaylist(favId ?? undefined);

  const isFavourited = !!(track?.uri && playlist?.tracks.some((t) => t.uri === track.uri));

  const toggle = useCallback(async () => {
    if (!favId || !track?.uri || !displayName) return;
    const snapshot = queryClient.getQueryData(playlistQueryOptions(favId).queryKey);
    if (isFavourited) {
      if (snapshot) {
        queryClient.setQueryData(playlistKeys.detail(favId), {
          ...snapshot,
          tracks: snapshot.tracks.filter((t) => t.uri !== track.uri),
        });
      }
      try {
        await window.sonos.removeTrackFromPlaylist(favId, track.uri);
        void queryClient.invalidateQueries({ queryKey: playlistKeys.detail(favId) });
        void queryClient.invalidateQueries({ queryKey: playlistKeys.owned(displayName) });
      } catch {
        if (snapshot) queryClient.setQueryData(playlistKeys.detail(favId), snapshot);
        showToast('Failed to remove from Favourites');
      }
    } else {
      const playlistTrack: PlaylistTrack = {
        uri: track.uri,
        trackName: track.trackName ?? '',
        artist: track.artist ?? '',
        albumName: track.albumName,
        imageUrl: track.imageUrl ?? null,
        serviceId: track.serviceId ?? '',
        accountId: track.accountId ?? '',
        addedBy: displayName,
        addedAt: Date.now(),
      };
      if (snapshot) {
        queryClient.setQueryData(playlistKeys.detail(favId), {
          ...snapshot,
          tracks: [...snapshot.tracks, playlistTrack],
        });
      }
      try {
        await window.sonos.addTrackToPlaylist(favId, playlistTrack);
        void queryClient.invalidateQueries({ queryKey: playlistKeys.detail(favId) });
        void queryClient.invalidateQueries({ queryKey: playlistKeys.owned(displayName) });
      } catch {
        if (snapshot) queryClient.setQueryData(playlistKeys.detail(favId), snapshot);
        showToast('Failed to add to Favourites');
      }
    }
  }, [favId, track, isFavourited, displayName, queryClient, showToast]);

  return { isFavourited, toggle };
}
