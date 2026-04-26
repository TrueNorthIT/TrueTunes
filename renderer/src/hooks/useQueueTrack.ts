import { useQueryClient } from '@tanstack/react-query';
import { useTrackDetails } from './useTrackDetails';
import { albumQueryOptions } from './useAlbumBrowse';
import { artistQueryOptions } from './useArtistBrowse';
import type { NormalizedQueueItem } from '../types/provider';
import type { SonosItem } from '../types/sonos';

export function useQueueTrack(item: NormalizedQueueItem, currentObjectId: string | null) {
  const queryClient = useQueryClient();

  const { id: trackId, serviceId, accountId } = item.track;

  const { data } = useTrackDetails(trackId || undefined, serviceId ?? undefined, accountId ?? undefined);

  const isPlaying = !!currentObjectId && item.track.id === currentObjectId;
  const artUrl    = data?.artUrl ?? item.track.imageUrl;
  const artist    = data?.artist ?? item.track.artist;
  const albumName = data?.albumName ?? item.track.albumName;
  const albumId   = data?.albumId ?? item.track.albumId;
  const albumSvcId = data?.serviceId ?? serviceId;
  const albumAccId = data?.accountId ?? accountId;
  const explicit  = item.track.isExplicit;

  const albumItem: SonosItem | null = albumId && albumName ? {
    title: albumName,
    type: 'ITEM_ALBUM',
    resource: { type: 'ALBUM', id: { objectId: albumId, serviceId: albumSvcId ?? '', accountId: albumAccId ?? '' } },
  } as SonosItem : null;

  const prefetchAlbum = albumId && albumSvcId && albumAccId
    ? () => queryClient.prefetchQuery(albumQueryOptions(albumId, albumSvcId!, albumAccId!, undefined))
    : undefined;

  const artistId  = data?.artistId ?? null;
  const artistItem: SonosItem | null = artistId && artist ? {
    name: artist,
    type: 'ARTIST',
    resource: { type: 'ARTIST', id: { objectId: artistId, serviceId: serviceId ?? '', accountId: accountId ?? '' } },
  } as SonosItem : null;

  const prefetchArtist = artistId && serviceId && accountId
    ? () => queryClient.prefetchQuery(artistQueryOptions(artistId, serviceId, accountId, undefined))
    : undefined;

  return { artUrl, artist, albumName, albumItem, prefetchAlbum, artistItem, prefetchArtist, isPlaying, explicit };
}
