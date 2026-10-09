import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../components/common/Toast';

export function useEnsureFavourites(userName: string | null | undefined) {
  return useQuery<PlaylistDoc>({
    queryKey: ['favourites-ensure', userName],
    queryFn: () => window.sonos.ensureFavourites(),
    enabled: !!userName,
    staleTime: 5 * 60_000,
    gcTime: Infinity,
    retry: 2,
  });
}

export function favouritesId(userName: string) {
  return `fav-${userName}`;
}

async function safeFetchPlaylists(filter: { owner?: string; member?: string }): Promise<PlaylistMeta[]> {
  const result = await window.sonos.fetchPlaylists(filter);
  return Array.isArray(result) ? result : [];
}

export function useMyPlaylists(userName: string | null | undefined) {
  const owned = useQuery<PlaylistMeta[]>({
    queryKey: ['playlists', 'owned', userName],
    queryFn: () => safeFetchPlaylists({ owner: userName! }),
    enabled: !!userName,
    staleTime: 2 * 60_000,
  });
  const joined = useQuery<PlaylistMeta[]>({
    queryKey: ['playlists', 'joined', userName],
    queryFn: () => safeFetchPlaylists({ member: userName! }),
    enabled: !!userName,
    staleTime: 2 * 60_000,
  });
  return {
    owned: owned.data ?? [],
    joined: joined.data ?? [],
    isLoading: owned.isLoading || joined.isLoading,
    refetch: () => { owned.refetch(); joined.refetch(); },
  };
}

export function usePlaylist(id: string | undefined) {
  return useQuery<PlaylistDoc>({
    queryKey: ['playlist', id],
    queryFn: async () => {
      const result = await window.sonos.fetchPlaylist(id!);
      if (!result || typeof result !== 'object' || 'error' in result) throw new Error('playlist not found');
      return result as PlaylistDoc;
    },
    enabled: !!id,
    staleTime: 60_000,
  });
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

  const isFavourited = !!(track?.uri && playlist?.tracks.some(t => t.uri === track.uri));

  const toggle = useCallback(async () => {
    if (!favId || !track?.uri || !displayName) return;
    const snapshot = queryClient.getQueryData<PlaylistDoc>(['playlist', favId]);
    if (isFavourited) {
      if (snapshot) {
        queryClient.setQueryData(['playlist', favId], {
          ...snapshot,
          tracks: snapshot.tracks.filter(t => t.uri !== track.uri),
        });
      }
      try {
        await window.sonos.removeTrackFromPlaylist(favId, track.uri);
        queryClient.invalidateQueries({ queryKey: ['playlist', favId] });
        queryClient.invalidateQueries({ queryKey: ['playlists', 'owned', displayName] });
      } catch {
        if (snapshot) queryClient.setQueryData(['playlist', favId], snapshot);
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
        queryClient.setQueryData(['playlist', favId], {
          ...snapshot,
          tracks: [...snapshot.tracks, playlistTrack],
        });
      }
      try {
        await window.sonos.addTrackToPlaylist(favId, playlistTrack);
        queryClient.invalidateQueries({ queryKey: ['playlist', favId] });
        queryClient.invalidateQueries({ queryKey: ['playlists', 'owned', displayName] });
      } catch {
        if (snapshot) queryClient.setQueryData(['playlist', favId], snapshot);
        showToast('Failed to add to Favourites');
      }
    }
  }, [favId, track, isFavourited, displayName, queryClient, showToast]);

  return { isFavourited, toggle };
}

export function useInvalidatePlaylists() {
  const queryClient = useQueryClient();
  return (userName: string) => {
    queryClient.invalidateQueries({ queryKey: ['playlists', 'owned', userName] });
    queryClient.invalidateQueries({ queryKey: ['playlists', 'joined', userName] });
  };
}
