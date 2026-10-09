import { describe, it, expect } from 'vitest';
import {
  albumMetaLine,
  buildBrowseItem,
  canMoveDown,
  canMoveUp,
  createPlaylistRoute,
  geniusToBlocks,
  moveItem,
  parseDetailParams,
  parsePendingTrack,
  trackSheetItem,
} from '../../../ui/detail/detailLogic';
import type { AlbumTrack } from '../../hooks/useAlbumBrowse';

describe('parseDetailParams', () => {
  it('reads strings, first of arrays, strips sn_ and drops empties', () => {
    expect(parseDetailParams({ id: 'a', serviceId: ['1', '2'], accountId: 'sn_9', defaults: '', name: 'X' })).toEqual({
      id: 'a',
      serviceId: '1',
      accountId: '9',
      defaults: undefined,
      name: 'X',
    });
  });
});

describe('buildBrowseItem', () => {
  it('returns null without id, else a typed resource', () => {
    expect(buildBrowseItem('ALBUM', {})).toBeNull();
    const item = buildBrowseItem('PLAYLIST', { id: 'p', serviceId: 's', accountId: 'a', defaults: 'd', name: 'N' });
    expect(item?.resource).toEqual({
      type: 'PLAYLIST',
      id: { objectId: 'p', serviceId: 's', accountId: 'a' },
      defaults: 'd',
    });
    expect(item?.type).toBe('PLAYLIST');
  });
});

describe('albumMetaLine', () => {
  it('joins songs, minutes and year, omitting empties', () => {
    expect(albumMetaLine(10, 2400, 1999)).toBe('10 songs • 40 min • 1999');
    expect(albumMetaLine(1, 20, null)).toBe('1 songs');
  });
});

describe('moveItem', () => {
  it('moves forward and back, and ignores out-of-range', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
  });
  it('bounds', () => {
    expect(canMoveUp(0)).toBe(false);
    expect(canMoveDown(2, 3)).toBe(false);
    expect(canMoveDown(1, 3)).toBe(true);
  });
});

describe('create-playlist route', () => {
  it('round-trips a pending track', () => {
    const t = { uri: 'u', trackName: 'T', artist: 'A', serviceId: 's', accountId: 'a', addedBy: 'me', addedAt: 0 };
    const href = createPlaylistRoute(t);
    const q = decodeURIComponent(href.split('track=')[1]);
    expect(parsePendingTrack(q)).toEqual(t);
    expect(createPlaylistRoute()).toBe('/create-playlist');
    expect(parsePendingTrack('nope')).toBeNull();
  });
});

describe('trackSheetItem', () => {
  const track = {
    title: 'S',
    ordinal: 1,
    durationSeconds: 10,
    artUrl: 'u',
    id: { objectId: 't1', serviceId: 's', accountId: 'sn_a' },
    artists: ['B'],
    artistObjects: [{ name: 'B', objectId: 'b1' }],
    albumName: 'LP',
    albumId: 'l1',
    explicit: true,
    raw: { title: 'S', resource: { type: 'TRACK', id: { objectId: 't1' } } },
  } as unknown as AlbumTrack;
  it('produces a normalised track item with artist and optional album ids', () => {
    const it = trackSheetItem(track, { includeAlbum: true });
    expect(it.id).toEqual({ objectId: 't1', serviceId: 's', accountId: 'a' });
    expect(it.artists?.[0].id?.objectId).toBe('b1');
    expect((it.album as { id: { objectId: string } }).id.objectId).toBe('l1');
    expect(trackSheetItem(track, {}).album).toBeUndefined();
  });
});

describe('geniusToBlocks', () => {
  it('flattens paragraphs, inline styles and links', () => {
    const tree: GeniusDomNode = {
      tag: 'root',
      children: [
        {
          tag: 'p',
          children: [
            'Hello ',
            { tag: 'strong', children: ['bold'] },
            ' and ',
            { tag: 'a', attributes: { href: 'http://x' }, children: ['link'] },
            '.',
          ],
        },
        { tag: 'p', children: ['Line1', { tag: 'br' }, 'Line2'] },
        { tag: 'ul', children: [{ tag: 'li', children: ['item'] }] },
        { tag: 'img' },
        { tag: 'p', children: ['   '] },
      ],
    };
    const blocks = geniusToBlocks(tree);
    expect(blocks).toHaveLength(3);
    expect(blocks[0].runs.map((r) => r.text).join('')).toBe('Hello bold and link.');
    expect(blocks[0].runs.find((r) => r.bold)?.text).toBe('bold');
    expect(blocks[0].runs.find((r) => r.href)?.href).toBe('http://x');
    expect(blocks[1].runs.map((r) => r.text).join('')).toBe('Line1\nLine2');
    expect(blocks[2].kind).toBe('li');
  });
  it('handles null, strings and bare inline roots', () => {
    expect(geniusToBlocks(null)).toEqual([]);
    expect(geniusToBlocks('plain')[0].runs[0].text).toBe('plain');
  });
});
