import { useQuery } from '@tanstack/react-query';

export function geniusAlbumYearQueryOptions(
  albumName: string | null | undefined,
  artistName: string | null | undefined,
) {
  return {
    queryKey: ['genius-album-year', albumName, artistName] as const,
    queryFn: (): Promise<number | null> =>
      window.sonos.geniusAlbumYear(albumName!, artistName!),
    staleTime: Infinity,
    retry: false,
    enabled: !!albumName && !!artistName,
  };
}

export function useGeniusAlbumYear(
  albumName: string | null | undefined,
  artistName: string | null | undefined,
) {
  const { data } = useQuery(geniusAlbumYearQueryOptions(albumName, artistName));
  return data ?? null;
}
