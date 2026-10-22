import { describe, it, expect } from 'vitest';
import { matchReleaseYears } from '../releaseYears';
import { releaseKey } from '../releaseShelves';
import type { SonosItem } from '../../types/sonos';

function album(title: string, objectId: string): SonosItem {
  return {
    id: objectId,
    title,
    subtitle: '',
    images: [],
    type: 'ITEM_ALBUM',
    isExplicit: false,
    resource: { id: { objectId, serviceId: '9', accountId: 'a' }, defaults: '' },
  } as SonosItem;
}

/** Runs the matcher on titles and returns title -> year for the matched ones. */
function years(titles: string[], genius: { name: string; year: number | null }[]) {
  const releases = titles.map((t, i) => album(t, `r${i}`));
  const map = matchReleaseYears(releases, genius);
  return Object.fromEntries(releases.flatMap((r) => (map.has(releaseKey(r)) ? [[r.title, map.get(releaseKey(r))]] : [])));
}

// Real Everything Everything entries from genius.com/api/artists/104263/albums
const EE = [
  { name: 'Mountainhead', year: 2024 },
  { name: 'Man Alive', year: 2010 },
  { name: 'Man Alive [Deluxe Edition]', year: 2023 },
  { name: 'Get to Heaven', year: 2015 },
  { name: 'Get to Heaven (Expanded 10th Anniversary edition)', year: 2025 },
  { name: 'Schoolin’ [Single]', year: 2010 },
  { name: 'Don’t Try', year: 2013 },
  { name: 'Arc', year: null },
];

describe('matchReleaseYears', () => {
  it('matches an exact title', () => {
    expect(years(['Mountainhead'], EE)).toEqual({ Mountainhead: 2024 });
  });

  it('matches exact after normalising case, brackets and the word "edition"', () => {
    expect(years(['Man Alive (Deluxe)', 'Get To Heaven (Expanded 10th Anniversary edition)'], EE)).toEqual({
      'Man Alive (Deluxe)': 2023,
      'Get To Heaven (Expanded 10th Anniversary edition)': 2025,
    });
  });

  it('prefers the exact match over an earlier base match', () => {
    expect(years(['Man Alive'], EE)).toEqual({ 'Man Alive': 2010 });
  });

  it('falls back to the earliest year among base-title matches', () => {
    expect(years(['Get To Heaven (Deluxe)', 'Man Alive (Live)'], EE)).toEqual({
      'Get To Heaven (Deluxe)': 2015,
      'Man Alive (Live)': 2010,
    });
  });

  it('matches bracket-only variants and straightens curly quotes', () => {
    expect(years(["Schoolin'", "Don't Try"], EE)).toEqual({ "Schoolin'": 2010, "Don't Try": 2013 });
  });

  it('leaves out unmatched and null-year releases', () => {
    expect(years(['Arc', 'Raw Data Feel'], EE)).toEqual({});
  });

  it('returns an empty map for no Genius data', () => {
    expect(matchReleaseYears([album('Mountainhead', 'r0')], []).size).toBe(0);
  });
});
