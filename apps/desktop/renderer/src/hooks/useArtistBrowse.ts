import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/sonosApi';
import { isArtist, parseServiceSearch } from '../lib/itemHelpers';
import type { AlbumTrack } from './useAlbumBrowse';
import { parsePlaylistTracks } from './usePlaylistBrowse';
import type { ServiceSearch } from '../types/ServiceSearch';
import type { SonosItem, SonosItemId } from '../types/sonos';
import { ArtistResponse } from '../types/ArtistResponse';

export interface ArtistData {
  name: string;
  imageUrl: string | null;
  albums: SonosItem[];
  playlists: SonosItem[]; // Artist Shuffle, Artist Radio (no Top Songs)
  topSongs: AlbumTrack[];
  genius: GeniusArtistInfo | null;
}

function parseArtist(data: ArtistResponse): { parsed: Omit<ArtistData, 'topSongs' | 'genius'>; topSongsItem: SonosItem | null } {
  const name = data.title ?? '';
  const imageUrl = data.images?.tile1x1 ?? null;
  const allItems = (data.sections?.items?.[0]?.items ?? []) as unknown as SonosItem[];

  const topSongsItem =
    allItems.find((i) => i.type === 'ITEM_PLAYLIST' && (i.title as string)?.toLowerCase().includes('top songs')) ??
    null;

  const albums = allItems.filter((i) => i.type === 'ITEM_ALBUM');
  const playlists = allItems.filter((i) => i.type === 'ITEM_PLAYLIST' && i !== topSongsItem);

  return { parsed: { name, imageUrl, albums, playlists }, topSongsItem };
}

export function artistQueryOptions(
  artistId: string | undefined,
  serviceId: string | undefined,
  accountId: string | undefined,
  defaults: string | undefined,
  fallbackName?: string,
) {
  return {
    queryKey: ['artist', artistId] as const,
    queryFn: async (): Promise<ArtistData> => {
      // First attempt: direct browse with whatever defaults we already have.
      let r = await api.browse.artist(artistId!, { serviceId, accountId, defaults, muse2: true });

      // YT Music (and some other services) need an opaque `defaults` blob to
      // return a populated artist response. Navigation sources like the
      // leaderboard don't capture defaults, so the direct browse comes back
      // with no title/sections. Resolve via search to get a properly-defaulted
      // item, then retry the browse.
      const looksEmpty = !!r.error || !(r.data as ArtistResponse | undefined)?.title;
      if (looksEmpty && fallbackName) {
        const sResp = await api.search.serviceQuery(fallbackName, { count: 20 });
        if (!sResp.error && sResp.data) {
          const items = parseServiceSearch(sResp.data as ServiceSearch);
          const artists = items.filter(isArtist);
          const matched =
            artists.find((a) => {
              const rid = a.resource?.id as SonosItemId | undefined;
              return rid?.objectId === artistId;
            }) ?? artists[0];
          if (matched) {
            const mid = matched.resource?.id as SonosItemId | undefined;
            const mDefaults = matched.resource?.defaults as string | undefined;
            r = await api.browse.artist(mid?.objectId ?? artistId!, {
              serviceId: mid?.serviceId ?? serviceId,
              accountId: mid?.accountId ?? accountId,
              defaults: mDefaults ?? defaults,
              muse2: true,
            });
          }
        }
      }
      if (r.error) throw new Error(r.error);

      const { parsed, topSongsItem } = parseArtist(r.data as ArtistResponse);

      const fetchTopSongs = async (): Promise<AlbumTrack[]> => {
        if (!topSongsItem) return [];
        const rid = topSongsItem.resource?.id as SonosItemId | undefined;
        if (!rid?.objectId || !rid?.serviceId || !rid?.accountId) return [];
        const pr = await api.browse.playlist(rid.objectId, {
          serviceId: rid.serviceId,
          accountId: rid.accountId,
          defaults: topSongsItem.resource?.defaults as string | undefined,
          muse2: true,
        });
        return pr.error ? [] : parsePlaylistTracks(pr.data);
      };

      const [topSongs, genius] = await Promise.all([
        fetchTopSongs(),
        window.sonos.geniusArtist(parsed.name),
      ]);

      return { ...parsed, topSongs, genius };
    },
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
  };
}

export function useArtistBrowse(
  artistId: string | undefined,
  serviceId: string | undefined,
  accountId: string | undefined,
  defaults?: string,
  fallbackName?: string,
) {
  return useQuery({
    ...artistQueryOptions(artistId, serviceId, accountId, defaults, fallbackName),
    enabled: !!(artistId && serviceId && accountId),
  });
}

/**
 * Lightweight fetch for just the artist's image — used by avatar UI where the
 * full artistQueryOptions (top songs + Genius bio) would be wasteful. Cached
 * under a distinct key so it doesn't conflict with the full browse cache.
 */
export function useArtistImage(
  artistId: string | undefined,
  serviceId: string | undefined,
  accountId: string | undefined,
  defaults?: string,
) {
  return useQuery({
    queryKey: ['artist-image', artistId] as const,
    queryFn: async (): Promise<string | null> => {
      const r = await api.browse.artist(artistId!, { serviceId, accountId, defaults, muse2: true });
      if (r.error || !r.data) return null;
      return (r.data as ArtistResponse).images?.tile1x1 ?? null;
    },
    enabled: !!(artistId && serviceId && accountId),
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
    retry: false,
  });
}
