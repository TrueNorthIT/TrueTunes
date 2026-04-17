import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/sonosApi';
import type { AlbumTrack } from './useAlbumBrowse';
import { parsePlaylistTracks } from './usePlaylistBrowse';
import type { SonosItem, SonosItemId } from '../types/sonos';
import { ArtistResponse } from '../types/ArtistResponse';

export interface ArtistData {
  name: string;
  imageUrl: string | null;
  albums: SonosItem[];
  playlists: SonosItem[]; // Artist Shuffle, Artist Radio (no Top Songs)
  topSongs: AlbumTrack[];
}

function parseArtist(data: ArtistResponse): { parsed: Omit<ArtistData, 'topSongs'>; topSongsItem: SonosItem | null } {
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
  defaults: string | undefined
) {
  return {
    queryKey: ['artist', artistId] as const,
    queryFn: async (): Promise<ArtistData> => {
      const r = await api.browse.artist(artistId!, { serviceId, accountId, defaults, muse2: true });
      if (r.error) throw new Error(r.error);

      const { parsed, topSongsItem } = parseArtist(r.data as ArtistResponse);

      let topSongs: AlbumTrack[] = [];
      if (topSongsItem) {
        const rid = topSongsItem.resource?.id as SonosItemId | undefined;
        if (rid?.objectId && rid?.serviceId && rid?.accountId) {
          const pr = await api.browse.playlist(rid.objectId, {
            serviceId: rid.serviceId,
            accountId: rid.accountId,
            defaults: topSongsItem.resource?.defaults as string | undefined,
            muse2: true,
          });
          if (!pr.error) topSongs = parsePlaylistTracks(pr.data);
        }
      }

      return { ...parsed, topSongs };
    },
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
  };
}

export function useArtistBrowse(
  artistId: string | undefined,
  serviceId: string | undefined,
  accountId: string | undefined,
  defaults?: string
) {
  return useQuery({
    ...artistQueryOptions(artistId, serviceId, accountId, defaults),
    enabled: !!(artistId && serviceId && accountId),
  });
}
