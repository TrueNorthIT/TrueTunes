import { baseTitle, groupReleases, releaseKey, sortShelvesByYear, type ReleaseGroup } from './releaseShelves';
import type { SonosItem } from '../types/sonos';

/**
 * "More by" on an album page: the artist's other releases, one tile per release group, albums first then
 * singles, each newest first with releases of no known year after the dated ones. Drops this album's own group
 * (its editions, "(B Sides)", deluxe and so on) and singles cut from it (a single whose title is one of this
 * album's tracks). Alternates (remixes, live) are left out.
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
  const sorted = sortShelvesByYear(groupReleases(releases, trackCounts), years);
  // sortShelvesByYear lets an undated group inherit its neighbour's year (right for the artist page's full list);
  // here the undated ones go last, so a short shelf leads with releases we can date. sort is stable.
  const datedFirst = (groups: ReleaseGroup[]) =>
    [...groups].sort((a, b) => Number(!years.has(releaseKey(a.primary))) - Number(!years.has(releaseKey(b.primary))));
  const shelves = { albums: datedFirst(sorted.albums), singles: datedFirst(sorted.singles) };
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
