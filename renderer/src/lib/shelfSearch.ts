import { releaseKey, type ReleaseGroup, type ReleaseShelves } from './releaseShelves';
import type { SonosItem } from '../types/sonos';

export interface ShelfSearchResult {
  shelves: ReleaseShelves;
  /** releaseKey(version) -> matching track titles, only for versions that matched on tracks but not on title. */
  trackHits: Map<string, string[]>;
}

/** Lowercase, accent-free, straight apostrophes, single spaces. */
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’ʼ]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function filterShelves(
  shelves: ReleaseShelves,
  query: string,
  tracksByRelease: Map<string, string[]>,
): ShelfSearchResult {
  const q = norm(query);
  const trackHits = new Map<string, string[]>();
  if (!q) return { shelves, trackHits };

  const keep = (v: SonosItem): boolean => {
    if (norm(v.title ?? '').includes(q)) return true;
    const hits = (tracksByRelease.get(releaseKey(v)) ?? []).filter((t) => norm(t).includes(q));
    if (hits.length === 0) return false;
    trackHits.set(releaseKey(v), hits);
    return true;
  };

  const filterShelf = (groups: ReleaseGroup[]): ReleaseGroup[] =>
    groups.flatMap((g) => {
      const versions = g.versions.filter(keep);
      if (versions.length === 0) return [];
      return [{ primary: versions.includes(g.primary) ? g.primary : versions[0], versions }];
    });

  return {
    shelves: { albums: filterShelf(shelves.albums), singles: filterShelf(shelves.singles), other: filterShelf(shelves.other) },
    trackHits,
  };
}
