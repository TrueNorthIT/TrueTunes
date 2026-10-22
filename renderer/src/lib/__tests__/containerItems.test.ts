import { describe, it, expect } from 'vitest';
import { artistItemOf, containerKind, containerSummary, groupContainerItems } from '../containerItems';
import type { SonosItem } from '../../types/sonos';

const item = (type: string, name = type, itemType?: string): SonosItem =>
  ({ name, type: itemType ?? `ITEM_${type}`, resource: { type } }) as SonosItem;

describe('containerKind', () => {
  it('reads the resource type', () => {
    expect(containerKind(item('TRACK'))).toBe('songs');
    expect(containerKind(item('ALBUM'))).toBe('albums');
    expect(containerKind(item('PLAYLIST'))).toBe('playlists');
    expect(containerKind(item('ARTIST'))).toBe('artists');
    expect(containerKind(item('CONTAINER'))).toBe('other');
  });
  it('treats a program as a station even when its item type says otherwise', () => {
    expect(containerKind(item('PROGRAM', 'Mix', 'ITEM_STATION'))).toBe('stations');
    expect(containerKind(item('PROGRAM', 'Mix', 'ITEM_TRACK'))).toBe('stations');
  });
});

describe('groupContainerItems', () => {
  it('groups by kind in first-appearance order and keeps the service order inside a group', () => {
    const groups = groupContainerItems([
      item('ALBUM', 'a1'), item('TRACK', 't1'), item('PLAYLIST', 'p1'), item('TRACK', 't2'), item('ALBUM', 'a2'),
    ]);
    expect(groups.map((g) => g.kind)).toEqual(['albums', 'songs', 'playlists']);
    expect(groups[0].items.map((i) => i.name)).toEqual(['a1', 'a2']);
    expect(groups[1].items.map((i) => i.name)).toEqual(['t1', 't2']);
  });
  it('returns nothing for an empty shelf', () => {
    expect(groupContainerItems([])).toEqual([]);
  });
});

describe('containerSummary', () => {
  it('counts each kind with the right noun', () => {
    const groups = groupContainerItems([item('ALBUM'), item('ALBUM'), item('PLAYLIST'), item('TRACK')]);
    expect(containerSummary(groups)).toBe('2 albums · 1 playlist · 1 song');
  });
});

describe('artistItemOf', () => {
  it('reads the SRN string a container browse gives', () => {
    const item = artistItemOf({ name: 'Daft Punk', id: 'srn:content:audio:artist:ALkSOiE#72711:13' });
    expect(item?.resource?.id).toEqual({ objectId: 'ALkSOiE', serviceId: '72711', accountId: '13' });
    expect(item?.name).toBe('Daft Punk');
  });
  it('passes an id object straight through', () => {
    const id = { objectId: 'a1', serviceId: 's', accountId: 'acc' };
    expect(artistItemOf({ name: 'A', id })?.resource?.id).toEqual(id);
  });
  it('is null without a usable id, so the caller falls back to a name search', () => {
    expect(artistItemOf({ name: 'A' })).toBeNull();
    expect(artistItemOf({ name: 'A', id: 'srn:content:audio:album:x#1:2' })).toBeNull();
  });
});
