import { baseTitle, groupReleases, releaseKey, sortShelvesByYear } from './releaseShelves';
import type { SonosItem } from '../types/sonos';

/**
 * "More by" on an album page: the artist's other releases, one tile per release group, albums first then
 * singles, each newest first. Drops this album's own group (its editions, "(B Sides)", deluxe and so on) and
 * singles cut from it (a single whose title is one of this album's tracks). Alternates (remixes, live) are left out.
 */
export function moreByReleases(
  releases: SonosItem[],
  current: { albumId?: string; title: string; trackTitles: string[] },
  trackCounts: Map<string, number>,
  years: Map<string, number>,
  limit = 12
): { item: SonosItem; year?: number }[] {
  const ownBase = baseTitle(current.title);
  const tracks = new Set(current.trackTitles.map(baseTitle));
  const shelves = sortShelvesByYear(groupReleases(releases, trackCounts), years);
  const isOwn = (versions: SonosItem[]) =>
    versions.some(
      (v) => (!!current.albumId && releaseKey(v) === current.albumId) || baseTitle(v.title ?? '') === ownBase
    );
  return [
    ...shelves.albums.filter((g) => !isOwn(g.versions)),
    ...shelves.singles.filter((g) => !isOwn(g.versions) && !tracks.has(baseTitle(g.primary.title ?? ''))),
  ]
    .slice(0, limit)
    .map((g) => ({ item: g.primary, year: years.get(releaseKey(g.primary)) }));
}
