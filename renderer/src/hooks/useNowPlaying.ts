import { useQueryClient } from '@tanstack/react-query';
import { useImage } from './useImage';
import { useTrackDetails } from './useTrackDetails';
import { useDominantColor } from './useDominantColor';
import { albumQueryOptions } from './useAlbumBrowse';
import type { PlaybackState } from './usePlayback';
import type { SonosItem } from '../types/sonos';

export function useNowPlaying(playback: PlaybackState) {
  const {
    artUrl, trackName, artistName, timeLabel,
    progressPct, durationMs, isPlaying, isVisible,
    shuffle, repeat, volume, isExplicit,
    currentObjectId, currentServiceId, currentAccountId,
    currentAlbumId, currentAlbumName,
  } = playback;

  const { data: td } = useTrackDetails(
    currentObjectId ?? undefined,
    currentServiceId ?? undefined,
    currentAccountId ?? undefined,
  );

  const cachedArt     = useImage(td?.artUrl ?? artUrl);
  const dominantColor = useDominantColor(cachedArt);

  const displayTrack  = td?.trackName  ?? trackName;
  const displayArtist = td?.artist     ?? artistName;
  const albumName     = td?.albumName  ?? currentAlbumName;
  const albumId       = td?.albumId    ?? currentAlbumId;
  const svcId         = td?.serviceId  ?? currentServiceId  ?? undefined;
  const accId         = td?.accountId  ?? currentAccountId  ?? undefined;

  const [elapsedLabel = '', durationLabel = ''] = timeLabel ? timeLabel.split(' / ') : [];

  const queryClient = useQueryClient();
  const prefetchAlbum = () => {
    if (albumId && svcId && accId) {
      queryClient.prefetchQuery(albumQueryOptions(albumId, svcId, accId, undefined));
    }
  };

  const albumItem: SonosItem | null = albumId ? {
    title: albumName ?? '',
    type: 'ITEM_ALBUM',
    resource: { type: 'ALBUM', id: { objectId: albumId, serviceId: svcId, accountId: accId } },
  } as SonosItem : null;

  return {
    // Display values
    displayTrack, displayArtist, albumName, albumId,
    cachedArt, dominantColor,
    elapsedLabel, durationLabel,
    // Passthrough from playback state
    progressPct, durationMs, isPlaying, isVisible,
    shuffle, repeat, volume, isExplicit,
    // Derived
    albumItem,
    prefetchAlbum,
  };
}
