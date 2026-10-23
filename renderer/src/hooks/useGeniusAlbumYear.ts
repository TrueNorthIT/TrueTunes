import { queryOptions, useQuery } from '@tanstack/react-query';
import { STALE } from '../lib/queryDefaults';

export const geniusYearKeys = {
  album: (albumName: string | null | undefined, artistName: string | null | undefined) =>
    ['genius-album-year', albumName, artistName] as const,
};

export function geniusAlbumYearQueryOptions(
  albumName: string | null | undefined,
  artistName: string | null | undefined
) {
  return queryOptions({
    queryKey: geniusYearKeys.album(albumName, artistName),
    queryFn: (): Promise<number | null> => window.sonos.geniusAlbumYear(albumName!, artistName!),
    staleTime: STALE.forever,
    retry: false,
    enabled: !!albumName && !!artistName,
  });
}

export function useGeniusAlbumYear(albumName: string | null | undefined, artistName: string | null | undefined) {
  const { data } = useQuery(geniusAlbumYearQueryOptions(albumName, artistName));
  return data ?? null;
}
