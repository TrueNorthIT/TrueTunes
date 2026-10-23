import { describe, it, expect } from 'vitest';
import { groupReleases, releaseKey } from '../releaseShelves';
import type { SonosItem } from '../../types/sonos';

// atob() in decodeDefaults yields UTF-8 bytes as Latin-1 ("•" is mangled), so the code must not rely on the bullet.
// Release label comes from base64 JSON in resource.defaults: { summary: "Album • Artist" }
function item(title: string, objectId: string, summary?: string): SonosItem {
  const defaults =
    summary === undefined ? '' : btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify({ summary }))));
  return { id: objectId, title, resource: { id: { objectId }, defaults } } as SonosItem;
}
const titles = (gs: { primary: SonosItem }[]) => gs.map((g) => g.primary.title);

describe('release label from defaults.summary', () => {
  it('Album label beats a small track count', () => {
    const r = item('X', 'x', 'Album • Me');
    expect(titles(groupReleases([r], new Map([[releaseKey(r), 2]])).albums)).toEqual(['X']);
  });
  it('Single and EP labels beat a big track count (case-insensitive)', () => {
    const a = item('A', 'a', 'Single • Me');
    const b = item('B', 'b', 'ep • Me');
    const s = groupReleases(
      [a, b],
      new Map([
        ['a', 12],
        ['b', 12],
      ])
    );
    expect(titles(s.singles)).toEqual(['A', 'B']);
    expect(s.albums).toHaveLength(0);
  });
  it('unknown label falls back to track count', () => {
    const a = item('A', 'a', 'Compilation • Me');
    expect(titles(groupReleases([a], new Map([['a', 2]])).singles)).toEqual(['A']);
  });
  it('alternate title still goes to other whatever the label', () => {
    const a = item('A (Live)', 'a', 'Album • Me');
    expect(titles(groupReleases([a], new Map()).other)).toEqual(['A (Live)']);
  });
  it('Man Alive (Album) with Deluxe labelled Single: one albums group, Man Alive primary', () => {
    const s = groupReleases(
      [item('Man Alive (Deluxe)', 'd', 'Single • Me'), item('Man Alive', 'm', 'Album • Me')],
      new Map()
    );
    expect(s.singles).toHaveLength(0);
    expect(s.albums).toHaveLength(1);
    expect(s.albums[0].primary.title).toBe('Man Alive');
  });
  it('tie-break: Album label first, then higher count, then input order', () => {
    const s1 = groupReleases(
      [item('A Fever Dream', 'a', 'Single • Me'), item('A Fever Dream', 'b', 'Album • Me')],
      new Map()
    );
    expect(releaseKey(s1.albums[0].primary)).toBe('b');
    const s2 = groupReleases(
      [item('F', 'a'), item('F', 'b')],
      new Map([
        ['a', 3],
        ['b', 9],
      ])
    );
    expect(releaseKey(s2.albums[0].primary)).toBe('b');
    const s3 = groupReleases([item('G', 'a'), item('G', 'b')], new Map());
    expect(releaseKey(s3.albums[0].primary)).toBe('a');
  });
});
