import { useQuery, useQueryClient } from '@tanstack/react-query';

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

export function useInvalidatePlaylists() {
  const queryClient = useQueryClient();
  return (userName: string) => {
    queryClient.invalidateQueries({ queryKey: ['playlists', 'owned', userName] });
    queryClient.invalidateQueries({ queryKey: ['playlists', 'joined', userName] });
  };
}
