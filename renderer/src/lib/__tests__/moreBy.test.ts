import { describe, it, expect } from 'vitest';
import { moreByReleases } from '../moreBy';
import type { SonosItem } from '../../types/sonos';

function item(title: string, objectId: string, label: 'Album' | 'Single'): SonosItem {
  const defaults = btoa(JSON.stringify({ summary: `${label} - Wolf Alice` }));
  return { id: objectId, title, resource: { id: { objectId }, defaults } } as SonosItem;
}

// The Clearing by Wolf Alice: the artist browse lists the album, its B sides, and singles cut from it.
const releases = [
  item('The Clearing', 'clearing', 'Album'),
  item('The Clearing (B Sides)', 'bsides', 'Album'),
  item('Bloom Baby Bloom', 'bloom', 'Single'),
  item('Just Two Girls', 'girls', 'Single'),
  item('Blue Weekend', 'blue', 'Album'),
  item('My Love Is Cool', 'cool', 'Album'),
  item('Visions of a Life', 'visions', 'Album'),
  item('Smile', 'smile', 'Single'),
  item('Moaning Lisa Smile (Live)', 'live', 'Single'),
];
const years = new Map([['blue', 2021], ['cool', 2015], ['visions', 2017], ['smile', 2021]]);
const current = { albumId: 'clearing', title: 'The Clearing', trackTitles: ['Thorns', 'Bloom Baby Bloom', 'Just Two Girls'] };
const titles = (r: { item: SonosItem }[]) => r.map(x => x.item.title);

describe('moreByReleases', () => {
  it('drops this album, its versions and its singles; albums newest first, then singles', () => {
    const r = moreByReleases(releases, current, new Map(), years);
    expect(titles(r)).toEqual(['Blue Weekend', 'Visions of a Life', 'My Love Is Cool', 'Smile']);
    expect(r.map(x => x.year)).toEqual([2021, 2017, 2015, 2021]);
  });
  it('matches this album by title when the id differs (another edition of it)', () => {
    const r = moreByReleases(releases, { ...current, albumId: 'other-id' }, new Map(), years);
    expect(titles(r)).not.toContain('The Clearing');
    expect(titles(r)).not.toContain('The Clearing (B Sides)');
  });
  it('caps the shelf', () => {
    expect(moreByReleases(releases, current, new Map(), years, 2)).toHaveLength(2);
  });
});
