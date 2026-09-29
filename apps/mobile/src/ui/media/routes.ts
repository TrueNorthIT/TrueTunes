// Route conventions for detail screens. The browse UI (this folder, Home, Search) builds hrefs with
// these helpers; the detail-screen agent implements the screens against the SAME params.
//
// Detail routes (all params are URL-encoded strings; optional ones are omitted when unknown):
//   /album/[id]      id = albumId (objectId).   query: serviceId, accountId, defaults?, name?
//   /artist/[id]     id = artistId (objectId).  query: serviceId, accountId, defaults?, name?
//   /container/[id]  id = containerId (objectId). query: serviceId, accountId, defaults?, name?
//                    (ITEM_AUDIO / ITEM_STUDIO / ITEM_PLAYLIST / CONTAINER / SECTION browse items)
//   /playlist/[id]   id = TrueTunes custom playlist id (PlaylistMeta.id, e.g. "fav-<user>"). No query.
//   /profile/[id]    id = userId (display name). No query.
// `defaults` is the opaque base64 blob from item.resource.defaults, passed through untouched.
// `name` is only a header hint shown while loading. accountId has the "sn_" prefix already stripped
// (see resolveAlbumParams). Sonos PLAYLIST items open as /album/[id] like desktop's useOpenItem.
import type { NavigateFn } from '../../logic/hooks/useOpenItem';
import {
  getName,
  isArtist,
  isContainer,
  resolveAlbumParams,
  resolveArtistParams,
} from '../../logic/lib/itemHelpers';
import type { SonosAlbum, SonosArtist, SonosItem, SonosItemId } from '../../logic/types/sonos';

export type DetailKind = 'album' | 'artist' | 'container';

interface RouteArgs {
  id: string | undefined;
  serviceId?: string;
  accountId?: string;
  defaults?: string;
  name?: string;
}

export function buildDetailRoute(kind: DetailKind, a: RouteArgs): string | null {
  if (!a.id) return null;
  const q: string[] = [];
  const add = (k: string, v?: string) => {
    if (v) q.push(`${k}=${encodeURIComponent(v)}`);
  };
  add('serviceId', a.serviceId);
  add('accountId', a.accountId);
  add('defaults', a.defaults);
  add('name', a.name);
  return `/${kind}/${encodeURIComponent(a.id)}${q.length ? `?${q.join('&')}` : ''}`;
}

/** Where tapping a Sonos item goes (mirrors desktop useOpenItem). Null if it has no id. */
export function routeForItem(item: SonosItem): string | null {
  const name = getName(item);
  const hint = name === '(unknown)' ? undefined : name;
  if (isArtist(item)) {
    const p = resolveArtistParams(item);
    return buildDetailRoute('artist', { id: p.artistId, serviceId: p.serviceId, accountId: p.accountId, defaults: p.defaults, name: hint });
  }
  const p = resolveAlbumParams(item);
  return buildDetailRoute(isContainer(item) ? 'container' : 'album', {
    id: p.albumId,
    serviceId: p.serviceId,
    accountId: p.accountId,
    defaults: p.defaults,
    name: hint,
  });
}

export const routeForPlaylist = (id: string) => `/playlist/${encodeURIComponent(id)}`;
export const routeForProfile = (userId: string) => `/profile/${encodeURIComponent(userId)}`;

/** "Go to album" for a track (or anything carrying an album reference). */
export function albumRouteForItem(item: SonosItem): string | null {
  const album = ((typeof item.album === 'object' ? item.album : undefined) ??
    (typeof item.track?.album === 'object' ? item.track.album : undefined)) as SonosAlbum | undefined;
  const rid = album?.id as SonosItemId | undefined;
  if (!rid?.objectId) return null;
  return buildDetailRoute('album', {
    id: rid.objectId,
    serviceId: rid.serviceId,
    accountId: rid.accountId?.replace(/^sn_/, ''),
    name: album?.name,
  });
}

/** "Go to artist": first credited artist that has an id, else the artist encoded in `defaults`. */
export function artistRouteForItem(item: SonosItem): string | null {
  if (isArtist(item)) return routeForItem(item);
  const candidates: unknown[] = [...(item.artists ?? []), item.artist, item.primaryArtist, item.track?.artist];
  for (const c of candidates) {
    const a = c as SonosArtist | undefined;
    if (a && typeof a === 'object' && a.id?.objectId) {
      return buildDetailRoute('artist', {
        id: a.id.objectId,
        serviceId: a.id.serviceId,
        accountId: a.id.accountId?.replace(/^sn_/, ''),
        name: a.name,
      });
    }
  }
  const p = resolveArtistParams(item);
  return buildDetailRoute('artist', { id: p.artistId, serviceId: p.serviceId, accountId: p.accountId, name: p.name });
}

/**
 * Adapter for useOpenItem / useResolveAndOpen, which call navigate(path, { state: { item } }) with
 * a path that has no query params. We rebuild the href from the item so params are not lost.
 */
export function makeNavigate(push: (href: string) => void): NavigateFn {
  return (to, options) => {
    const item = (options?.state as { item?: SonosItem } | undefined)?.item;
    push((item && routeForItem(item)) ?? to);
  };
}
