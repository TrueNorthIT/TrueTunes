import { decodeDefaults } from './itemHelpers';
import type { SonosItem } from '../types/sonos';

export interface ReleaseGroup {
  primary: SonosItem;
  /** Primary first, then the rest by rank (original > edition > alternate), ties by input order. */
  versions: SonosItem[];
}

export function releaseKey(item: SonosItem): string {
  const id = item.id;
  return item.resource?.id?.objectId ?? (typeof id === 'string' ? id : id?.objectId) ?? item.title ?? '';
}

export type ReleaseLabel = 'album' | 'single' | 'unknown';

/** The service's own label, from defaults.summary ("Album • Artist", "Single • …", "EP • …"). */
export function releaseLabel(item: SonosItem): ReleaseLabel {
  const summary = decodeDefaults(item.resource?.defaults)?.['summary'];
  const m = typeof summary === 'string' ? summary.match(/^\s*(album|single|ep)\b/i) : null;
  if (!m) return 'unknown';
  return m[1].toLowerCase() === 'album' ? 'album' : 'single';
}

const ALTERNATE = /\b(remix(es)?|mix|live|acoustic|radio edit|single version|instrumental|rework|demo)\b/i;
// "Live at Brixton", "Concert Live from Leeds" as the whole title (no marker suffix)
const LIVE_TITLE = /\blive (at|with|from|in)\b/i;

/** Splits a title into its base and trailing "(…)", "[…]" and " - …" suffixes. */
function parseTitle(title: string): { base: string; suffixes: string[] } {
  let rest = title.trim();
  const suffixes: string[] = [];
  for (;;) {
    const m = rest.match(/^(.*\S)\s*[([]([^)\]]*)[)\]]$/);
    if (!m) break;
    suffixes.push(m[2]);
    rest = m[1];
  }
  const dash = rest.indexOf(' - ');
  if (dash > 0) {
    suffixes.push(rest.slice(dash + 3));
    rest = rest.slice(0, dash);
  }
  return { base: rest.trim().toLowerCase(), suffixes };
}

type Rank = 0 | 1 | 2; // original, edition, alternate

function classify(title: string): { base: string; rank: Rank } {
  const { base, suffixes } = parseTitle(title);
  if (LIVE_TITLE.test(title) || suffixes.some((s) => ALTERNATE.test(s))) return { base, rank: 2 };
  if (suffixes.length === 0) return { base, rank: 0 };
  return { base, rank: 1 };
}

export function groupReleases(
  releases: SonosItem[],
  trackCounts: Map<string, number>
): { albums: ReleaseGroup[]; singles: ReleaseGroup[]; other: ReleaseGroup[] } {
  const byBase = new Map<string, { item: SonosItem; rank: Rank; i: number }[]>();
  releases.forEach((item, i) => {
    const { base, rank } = classify(item.title ?? '');
    const list = byBase.get(base);
    if (list) list.push({ item, rank, i });
    else byBase.set(base, [{ item, rank, i }]);
  });

  // A group sits at its earliest non-alternate member (its earliest member if all are alternates),
  // so a stray remix listed early does not drag the original's group up the shelf.
  const pos = (ms: { rank: Rank; i: number }[]) =>
    Math.min(
      ...ms.filter((m) => m.rank < 2).map((m) => m.i),
      ...(ms.every((m) => m.rank === 2) ? ms.map((m) => m.i) : [])
    );
  const ordered = [...byBase.values()].sort((a, b) => pos(a) - pos(b));

  const out = { albums: [] as ReleaseGroup[], singles: [] as ReleaseGroup[], other: [] as ReleaseGroup[] };
  for (const members of ordered) {
    // same rank: Album-labelled first, then more tracks, then input order
    const albumness = (m: { item: SonosItem }) => (releaseLabel(m.item) === 'album' ? 0 : 1);
    const count = (m: { item: SonosItem }) => trackCounts.get(releaseKey(m.item)) ?? 0;
    members.sort((a, b) => a.rank - b.rank || albumness(a) - albumness(b) || count(b) - count(a) || a.i - b.i);
    const primary = members[0];
    const group = { primary: primary.item, versions: members.map((m) => m.item) };
    if (primary.rank === 2) out.other.push(group);
    else {
      const label = releaseLabel(primary.item);
      const n = trackCounts.get(releaseKey(primary.item));
      const single = label === 'unknown' ? n !== undefined && n < 6 : label === 'single';
      (single ? out.singles : out.albums).push(group);
    }
  }
  return out;
}

/** Lowercased base title: trailing "(…)", "[…]" and " - …" suffixes stripped. */
export function baseTitle(title: string): string {
  return parseTitle(title).base;
}

export type ReleaseShelves = ReturnType<typeof groupReleases>;
type Shelves = ReleaseShelves;

/**
 * Sorts each shelf newest to oldest by the primary's year (years keyed by releaseKey).
 * A group with no year inherits the nearest preceding group's year in service order (a leading
 * unknown stays first). Stable. Within a group the primary stays first, the rest newest first.
 */
export function sortShelvesByYear(shelves: Shelves, years: Map<string, number>): Shelves {
  const sortShelf = (groups: ReleaseGroup[]): ReleaseGroup[] => {
    let prev = Infinity;
    return groups
      .map((g) => {
        const year = years.get(releaseKey(g.primary)) ?? prev;
        prev = year;
        const [first, ...rest] = g.versions;
        const yr = (v: SonosItem) => years.get(releaseKey(v)) ?? -Infinity;
        const sorted = [...rest].sort((a, b) => yr(b) - yr(a));
        return { year, group: { ...g, versions: [first, ...sorted] } };
      })
      .sort((a, b) => b.year - a.year)
      .map((x) => x.group);
  };
  return { albums: sortShelf(shelves.albums), singles: sortShelf(shelves.singles), other: sortShelf(shelves.other) };
}

/**
 * The newest album or single (never a live or alternate version), from shelves already sorted by
 * sortShelvesByYear. The album wins a tie or when neither year is known; null when both shelves are empty.
 */
export function latestRelease(shelves: Shelves, years: Map<string, number>): SonosItem | null {
  const album = shelves.albums[0]?.primary ?? null;
  const single = shelves.singles[0]?.primary ?? null;
  if (!album || !single) return album ?? single;
  const yr = (i: SonosItem) => years.get(releaseKey(i)) ?? -Infinity;
  return yr(single) > yr(album) ? single : album;
}
