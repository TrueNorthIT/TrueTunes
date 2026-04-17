import { useQueryClient } from '@tanstack/react-query';
import { getArt, getArtist, getAlbum, decodeDefaults } from '../lib/itemHelpers';
import { useTrackDetails } from './useTrackDetails';
import { albumQueryOptions } from './useAlbumBrowse';
import { artistQueryOptions } from './useArtistBrowse';
import type { QueueItem, SonosAlbum, SonosItem, SonosItemId } from '../types/sonos';

export function useQueueTrack(item: QueueItem, currentObjectId: string | null) {
  const queryClient = useQueryClient();

  const id        = item?.track?.id ?? (item?.id as SonosItemId | undefined);
  const trackId   = id?.objectId;
  const serviceId = id?.serviceId;
  const accountId = id?.accountId;

  const { data } = useTrackDetails(trackId, serviceId, accountId);

  const isPlaying = !!currentObjectId && (item?.track?.id?.objectId ?? '') === currentObjectId;
  const artUrl    = data?.artUrl ?? getArt(item);
  const artist    = data?.artist ?? getArtist(item);

  // Album: prefer enriched cache → track.album → resource.defaults
  const rawAlbum = item?.track?.album;
  const albumObj = typeof rawAlbum === 'object' && rawAlbum !== null ? rawAlbum as SonosAlbum : null;
  const defs     = decodeDefaults(item?.resource?.defaults);

  const albumName  = data?.albumName
    ?? albumObj?.name
    ?? getAlbum(item)
    ?? (defs?.['containerName'] as string | undefined)
    ?? null;
  const albumId    = data?.albumId
    ?? albumObj?.id?.objectId
    ?? (defs?.['containerId'] as string | undefined)
    ?? null;
  const albumSvcId = data?.serviceId ?? albumObj?.id?.serviceId ?? serviceId;
  const albumAccId = data?.accountId ?? albumObj?.id?.accountId ?? accountId;

  const explicit = !!(
    item?.track?.explicit ??
    (item?.track as Record<string, unknown> | undefined)?.['isExplicit']
  );

  const albumItem: SonosItem | null = albumId && albumName ? {
    title: albumName,
    type: 'ITEM_ALBUM',
    resource: { type: 'ALBUM', id: { objectId: albumId, serviceId: albumSvcId, accountId: albumAccId } },
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
