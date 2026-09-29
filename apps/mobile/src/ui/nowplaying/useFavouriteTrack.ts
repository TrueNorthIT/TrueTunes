import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { favouritesId, usePlaylist } from '../../logic/hooks/usePlaylists';
import { useShowToast } from '../Toast';
import { applyFavourite, buildFavouriteTrack, decideFavourite, isTrackFavourited } from './favouriteTrack';
import type { FavSource } from './favouriteTrack';

/**
 * Now Playing heart. Shares the ['playlist', favId] / ['playlists','owned',name] query keys with
 * the ActionSheet's "Add to Favourites" and desktop useFavourite, so all stay consistent.
 * displayName: undefined = loading, null = unset (tapping opens /display-name).
 */
export function useFavouriteTrack(displayName: string | null | undefined, track: FavSource) {
  const queryClient = useQueryClient();
  const showToast = useShowToast();
  const favId = displayName ? favouritesId(displayName) : null;
  const { data: playlist } = usePlaylist(favId ?? undefined);
  const [pending, setPending] = useState(false);
  const isFavourited = isTrackFavourited(playlist, track.uri);

  const toggle = useCallback(async () => {
    const decision = decideFavourite(displayName, track.uri, isFavourited);
    if (decision === 'prompt-name') { router.push('/display-name'); return; }
    if (decision === 'noop' || !favId || !displayName || !track.uri || pending) return;

    const key = ['playlist', favId];
    const snapshot = queryClient.getQueryData<PlaylistDoc>(key);
    const entry = buildFavouriteTrack(track, displayName);
    if (snapshot) queryClient.setQueryData(key, applyFavourite(snapshot, decision, entry));
    setPending(true);
    try {
      if (decision === 'remove') await window.sonos.removeTrackFromPlaylist(favId, track.uri);
      else await window.sonos.addTrackToPlaylist(favId, entry);
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ['playlists', 'owned', displayName] });
    } catch {
      if (snapshot) queryClient.setQueryData(key, snapshot);
      showToast(decision === 'remove' ? 'Failed to remove from Favourites' : 'Failed to add to Favourites', 'error');
    } finally {
      setPending(false);
    }
  }, [displayName, track, isFavourited, favId, pending, queryClient, showToast]);

  return { isFavourited, toggle };
}
