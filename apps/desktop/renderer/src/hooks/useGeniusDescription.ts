import { useQuery } from '@tanstack/react-query';

export function geniusDescriptionQueryOptions(
  trackName: string | null | undefined,
  artistName: string | null | undefined,
) {
  return {
    queryKey: ['genius-description', trackName, artistName] as const,
    queryFn: (): Promise<GeniusDomNode | null> =>
      window.sonos.geniusDescription(trackName!, artistName!),
    staleTime: Infinity,
    retry: false,
    enabled: !!trackName && !!artistName,
  };
}

export function useGeniusDescription(
  trackName: string | null | undefined,
  artistName: string | null | undefined,
) {
  const { data, isLoading } = useQuery(
    geniusDescriptionQueryOptions(trackName, artistName),
  );
  return { description: data ?? null, isLoading };
}
