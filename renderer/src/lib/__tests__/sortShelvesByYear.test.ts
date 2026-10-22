import { describe, it, expect } from 'vitest';
import { latestRelease, sortShelvesByYear, type ReleaseGroup } from '../releaseShelves';
import type { SonosItem } from '../../types/sonos';

const it_ = (id: string): SonosItem => ({ id, title: id }) as SonosItem;
const grp = (...ids: string[]): ReleaseGroup => ({ primary: it_(ids[0]), versions: ids.map(it_) });
const ids = (gs: ReleaseGroup[]) => gs.map((g) => g.primary.id);
const shelves = (albums: ReleaseGroup[]) => ({ albums, singles: [] as ReleaseGroup[], other: [] as ReleaseGroup[] });

describe('sortShelvesByYear', () => {
  it('sorts newest to oldest by the primary year', () => {
    const s = sortShelvesByYear(shelves([grp('a'), grp('b'), grp('c')]), new Map([['a', 2010], ['b', 2020], ['c', 2015]]));
    expect(ids(s.albums)).toEqual(['b', 'c', 'a']);
  });
  it('keeps service order for ties (stable)', () => {
    const s = sortShelvesByYear(shelves([grp('a'), grp('b'), grp('c')]), new Map([['a', 2020], ['b', 2020], ['c', 2020]]));
    expect(ids(s.albums)).toEqual(['a', 'b', 'c']);
  });
  it('a group with no year inherits the nearest preceding group year', () => {
    const s = sortShelvesByYear(
      shelves([grp('a'), grp('x'), grp('b')]),
      new Map([['a', 2010], ['b', 2020]]),
    );
    // x inherits 2010 from a, so it stays right after a
    expect(ids(s.albums)).toEqual(['b', 'a', 'x']);
  });
  it('a leading unknown has nothing to inherit and stays first', () => {
    const s = sortShelvesByYear(shelves([grp('x'), grp('a'), grp('b')]), new Map([['a', 2010], ['b', 2020]]));
    expect(ids(s.albums)).toEqual(['x', 'b', 'a']);
  });
  it('within a group the primary stays first, the rest newest first', () => {
    const g: ReleaseGroup = { primary: it_('p'), versions: [it_('p'), it_('o'), it_('n')] };
    const s = sortShelvesByYear(shelves([g]), new Map([['p', 2000], ['o', 2005], ['n', 2020]]));
    expect(s.albums[0].versions.map((v) => v.id)).toEqual(['p', 'n', 'o']);
  });
  it('sorts every shelf and does not mutate the input', () => {
    const input = { albums: [], singles: [grp('a'), grp('b')], other: [grp('c'), grp('d')] };
    const s = sortShelvesByYear(input, new Map([['a', 1], ['b', 2], ['c', 1], ['d', 2]]));
    expect(ids(s.singles)).toEqual(['b', 'a']);
    expect(ids(s.other)).toEqual(['d', 'c']);
    expect(ids(input.singles)).toEqual(['a', 'b']);
  });
});

describe('latestRelease', () => {
  const both = (albums: ReleaseGroup[], singles: ReleaseGroup[]) => ({ albums, singles, other: [grp('live')] });
  it('picks the newer of the top album and top single', () => {
    expect(latestRelease(both([grp('a')], [grp('s')]), new Map([['a', 2021], ['s', 2023]]))?.id).toBe('s');
    expect(latestRelease(both([grp('a')], [grp('s')]), new Map([['a', 2021], ['s', 2016]]))?.id).toBe('a');
  });
  it('prefers the album on a tie or when years are unknown', () => {
    expect(latestRelease(both([grp('a')], [grp('s')]), new Map([['a', 2021], ['s', 2021]]))?.id).toBe('a');
    expect(latestRelease(both([grp('a')], [grp('s')]), new Map())?.id).toBe('a');
  });
  it('never picks from the other versions shelf', () => {
    expect(latestRelease(both([], [grp('s')]), new Map([['live', 2030]]))?.id).toBe('s');
    expect(latestRelease(both([], []), new Map())).toBeNull();
  });
});
