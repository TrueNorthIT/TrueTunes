// Pure helpers behind the media components (no React Native imports so vitest can cover them).
import { getItemArt, getName, isAlbum, isArtist, isPlaylist, isTrack } from '../../logic/lib/itemHelpers';
import type { SonosArtist, SonosItem, SonosItemId } from '../../logic/types/sonos';

/** Port of desktop SearchResults.buildTrackPayload: SonosItem -> playlist track document. */
export function toPlaylistTrack(item: SonosItem, addedBy = ''): PlaylistTrack {
  const rid = (typeof item.id === 'object' ? item.id : item.resource?.id) as SonosItemId | undefined;
  const artist =
    typeof item.artist === 'string'
      ? item.artist
      : ((item.artist as SonosArtist | undefined)?.name ?? item.artists?.[0]?.name ?? '');
  const albumName = typeof item.album === 'string' ? item.album : item.album?.name;
  return {
    uri: rid?.objectId ?? '',
    trackName: getName(item),
    artist,
    albumName,
    imageUrl: getItemArt(item),
    serviceId: rid?.serviceId ?? '',
    accountId: rid?.accountId ?? '',
    addedBy,
    addedAt: 0,
  };
}

export interface SearchSections {
  artists: SonosItem[];
  albums: SonosItem[];
  tracks: SonosItem[];
  playlists: SonosItem[];
  others: SonosItem[];
}

/** Desktop SearchResults section split. Order inside each section follows the API order. */
export function shapeSearchSections(results: SonosItem[]): SearchSections {
  const out: SearchSections = { artists: [], albums: [], tracks: [], playlists: [], others: [] };
  for (const r of results) {
    if (isArtist(r)) out.artists.push(r);
    else if (isAlbum(r)) out.albums.push(r);
    else if (isTrack(r)) out.tracks.push(r);
    else if (isPlaylist(r)) out.playlists.push(r);
    else out.others.push(r);
  }
  return out;
}

export type ItemActionKey = 'playNext' | 'addToQueue' | 'goToAlbum' | 'goToArtist' | 'favourite' | 'addToPlaylist';

/** Which menu actions apply. Desktop: play next / add to queue / favourites / playlists (tracks only). */
export function actionsForItem(
  item: SonosItem,
  ctx: { hasAlbumRoute: boolean; hasArtistRoute: boolean; canPlaylist: boolean },
): ItemActionKey[] {
  const keys: ItemActionKey[] = ['playNext', 'addToQueue'];
  if (ctx.hasAlbumRoute && !isAlbum(item) && !isArtist(item)) keys.push('goToAlbum');
  if (ctx.hasArtistRoute && !isArtist(item)) keys.push('goToArtist');
  if (ctx.canPlaylist && isTrack(item)) keys.push('favourite', 'addToPlaylist');
  return keys;
}
