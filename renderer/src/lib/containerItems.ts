import { isAlbum, isArtist, isPlaylist, isProgram, isTrack, artistItem } from './itemHelpers';
import type { SonosItem, SonosItemId } from '../types/sonos';

export type ContainerKind = 'songs' | 'albums' | 'playlists' | 'stations' | 'artists' | 'other';

/** Section title, and the singular and plural nouns for the page's count line. */
export const KIND_COPY: Record<ContainerKind, { title: string; one: string; many: string }> = {
  songs: { title: 'Songs', one: 'song', many: 'songs' },
  albums: { title: 'Albums', one: 'album', many: 'albums' },
  playlists: { title: 'Playlists', one: 'playlist', many: 'playlists' },
  stations: { title: 'Stations', one: 'station', many: 'stations' },
  artists: { title: 'Artists', one: 'artist', many: 'artists' },
  other: { title: 'More', one: 'item', many: 'items' },
};

/** Program first: stations and mixes are PROGRAM resources whose item type can mention a track or album. */
export function containerKind(item: SonosItem): ContainerKind {
  if (isProgram(item)) return 'stations';
  if (isTrack(item)) return 'songs';
  if (isArtist(item)) return 'artists';
  if (isPlaylist(item)) return 'playlists';
  if (isAlbum(item)) return 'albums';
  return 'other';
}

export interface ContainerGroup {
  kind: ContainerKind;
  items: SonosItem[];
}

/** One group per kind, in the order each kind first appears, so the service's own ordering leads. */
export function groupContainerItems(items: SonosItem[]): ContainerGroup[] {
  const groups = new Map<ContainerKind, SonosItem[]>();
  for (const item of items) {
    const kind = containerKind(item);
    const list = groups.get(kind);
    if (list) list.push(item);
    else groups.set(kind, [item]);
  }
  return [...groups].map(([kind, list]) => ({ kind, items: list }));
}

/** "30 songs", or "5 albums · 2 playlists · 7 songs" for a mixed shelf. */
export function containerSummary(groups: ContainerGroup[]): string {
  return groups
    .map(({ kind, items }) => `${items.length} ${items.length === 1 ? KIND_COPY[kind].one : KIND_COPY[kind].many}`)
    .join(' · ');
}

/**
 * The artist page item for a browse track's artist. Container browses give the id as an SRN string
 * ("srn:content:audio:artist:<id>#<serviceId>:<accountId>"); search gives an id object. Null when neither.
 */
export function artistItemOf(artist: { name: string; id?: unknown }): SonosItem | null {
  const { name, id } = artist;
  if (id && typeof id === 'object' && (id as SonosItemId).objectId) {
    return artistItem(name, id as SonosItemId);
  }
  const m = typeof id === 'string' ? id.match(/^srn:content:audio:artist:([^#]+)#([^:]+):(.+)$/) : null;
  if (!m) return null;
  return artistItem(name, { objectId: m[1], serviceId: m[2], accountId: m[3] });
}
