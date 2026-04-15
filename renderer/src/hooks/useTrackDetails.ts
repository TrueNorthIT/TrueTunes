import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/sonosApi';
import { decodeDefaults } from '../lib/itemHelpers';

export interface TrackDetails {
  trackName: string | undefined;
  artUrl:    string | undefined;
  artist:    string | undefined;
  artistId:  string | undefined;
  albumName: string | undefined;
  albumId:   string | undefined;
  serviceId: string | undefined;
  accountId: string | undefined;
}

function parseResponse(data: unknown): TrackDetails {
  const d    = data as Record<string, unknown>;
  const item = d['item'] as Record<string, unknown> | undefined;

  // Track name
  const trackName: string | undefined =
    (d['title'] as string | undefined)
    ?? (item?.['title'] as string | undefined);

  // Top-level images (highest quality, yt3.googleusercontent.com)
  const images = d['images'] as Record<string, string> | undefined;
  const artUrl = images?.['tile1x1']
    ?? (item?.['images'] as Record<string, string> | undefined)?.['tile1x1'];

  // Artist from subtitle or artists array
  const artist: string | undefined =
    (d['subtitle'] as string | undefined)
    ?? (item?.['subtitle'] as string | undefined)
    ?? (item?.['artists'] as Array<{ name: string }> | undefined)?.[0]?.name;

  // Resource IDs
  const resourceId = (item?.['resource'] as Record<string, unknown> | undefined)?.['id'] as Record<string, string> | undefined;
  const serviceId  = resourceId?.['serviceId'];
  const accountId  = resourceId?.['accountId'];

  // Decode defaults for album + artistId
  const defaults  = (item?.['resource'] as Record<string, unknown> | undefined)?.['defaults'] as string | undefined;
  const defs      = decodeDefaults(defaults);
  const artistId  = defs?.['artistId']     as string | undefined;
  const albumName = defs?.['containerName'] as string | undefined;
  const albumId   = defs?.['containerId']   as string | undefined;

  return { trackName, artUrl, artist, artistId, albumName, albumId, serviceId, accountId };
}

export function useTrackDetails(
  trackId:      string | undefined,
  serviceId:    string | undefined,
  rawAccountId: string | undefined,
) {
  const accountId = (rawAccountId ?? '').replace(/^sn_/, '');
  return useQuery({
    queryKey: ['track', trackId],
    queryFn: async () => {
      const r = await api.nowPlaying.track(trackId!, { serviceId: serviceId!, accountId });
      if (!r.error) return parseResponse(r.data);

      // Fallback to YT Music when the original service isn't configured
      if (serviceId !== '72711') {
        const fallback = await api.nowPlaying.track(trackId!, { serviceId: '72711', accountId });
        if (!fallback.error) return parseResponse(fallback.data);
      }

      return null;
    },
    enabled:   !!(trackId && serviceId && accountId),
    staleTime: Infinity,
    gcTime:    60 * 60 * 1000,
    retry:     false,
  });
}
