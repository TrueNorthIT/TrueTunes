import { baseTitle, releaseKey } from './releaseShelves';
import type { SonosItem } from '../types/sonos';

/** "Man Alive [Deluxe Edition]" and "Man Alive (Deluxe)" both become "man alive deluxe". */
function norm(title: string): string {
  return title
    .toLowerCase()
    .replace(/[[(]([^\])]*)[\])]/g, (_, inner: string) => ` ${inner.replace(/\b(edition|version)\b/g, '')} `)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function setMin(map: Map<string, number>, key: string, year: number) {
  const cur = map.get(key);
  if (cur === undefined || year < cur) map.set(key, year);
}

/** Release years by releaseKey: an exact normalised-title match first, else the earliest base-title match. */
export function matchReleaseYears(
  releases: SonosItem[],
  geniusAlbums: { name: string; year: number | null }[],
): Map<string, number> {
  const exact = new Map<string, number>();
  const base = new Map<string, number>();
  for (const { name, year } of geniusAlbums) {
    if (year == null) continue;
    setMin(exact, norm(name), year);
    setMin(base, norm(baseTitle(name)), year);
  }
  const out = new Map<string, number>();
  for (const r of releases) {
    const title = r.title ?? '';
    const year = exact.get(norm(title)) ?? base.get(norm(baseTitle(title)));
    if (year !== undefined) out.set(releaseKey(r), year);
  }
  return out;
}
