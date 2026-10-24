import { queryOptions, useQuery } from '@tanstack/react-query';
import { STALE } from '../lib/queryDefaults';

export const geniusDescriptionKeys = {
  track: (trackName: string | null | undefined, artistName: string | null | undefined) =>
    ['genius-description', trackName, artistName] as const,
};

export function geniusDescriptionQueryOptions(
  trackName: string | null | undefined,
  artistName: string | null | undefined
) {
  return queryOptions({
    queryKey: geniusDescriptionKeys.track(trackName, artistName),
    queryFn: (): Promise<GeniusDomNode | null> => window.sonos.geniusDescription(trackName!, artistName!),
    staleTime: STALE.forever,
    retry: false,
    enabled: !!trackName && !!artistName,
  });
}

export function useGeniusDescription(trackName: string | null | undefined, artistName: string | null | undefined) {
  const { data, isLoading } = useQuery(geniusDescriptionQueryOptions(trackName, artistName));
  return { description: data ?? null, isLoading };
}
