import { describe, it, expect } from 'vitest';
import { applyFavourite, buildFavouriteTrack, decideFavourite, isTrackFavourited } from '../../../ui/nowplaying/favouriteTrack';
import { hexToRgb, hexToTintRgb, pickTintFromColors, rgba } from '../../../ui/nowplaying/colorMath';

const t = (uri: string) => ({ uri, trackName: uri, artist: 'a', serviceId: 's', accountId: 'c', addedBy: 'me', addedAt: 1 }) as PlaylistTrack;

describe('favourite decisions', () => {
  it('noop while loading or without a uri', () => {
    expect(decideFavourite(undefined, 'x', false)).toBe('noop');
    expect(decideFavourite('me', null, false)).toBe('noop');
  });
  it('prompts when the display name is unset', () => {
    expect(decideFavourite(null, 'x', false)).toBe('prompt-name');
  });
  it('adds or removes', () => {
    expect(decideFavourite('me', 'x', false)).toBe('add');
    expect(decideFavourite('me', 'x', true)).toBe('remove');
  });
  it('detects favourited', () => {
    expect(isTrackFavourited({ tracks: [t('a')] }, 'a')).toBe(true);
    expect(isTrackFavourited({ tracks: [t('a')] }, 'b')).toBe(false);
    expect(isTrackFavourited(undefined, 'a')).toBe(false);
  });
  it('applies optimistic changes', () => {
    const doc = { tracks: [t('a')] };
    expect(applyFavourite(doc, 'add', t('b')).tracks.map((x) => x.uri)).toEqual(['a', 'b']);
    expect(applyFavourite(doc, 'remove', t('a')).tracks).toEqual([]);
    expect(doc.tracks).toHaveLength(1);
  });
  it('builds a playlist track', () => {
    const tr = buildFavouriteTrack({ uri: 'u', trackName: 'n', artist: undefined, serviceId: null, accountId: 'x' }, 'me', 5);
    expect(tr).toMatchObject({ uri: 'u', artist: '', serviceId: '', addedBy: 'me', addedAt: 5, imageUrl: null });
  });
});

describe('colour maths', () => {
  it('parses hex', () => {
    expect(hexToRgb('#ff8000')).toEqual([255, 128, 0]);
    expect(hexToRgb('f80')).toEqual([255, 136, 0]);
    expect(hexToRgb('#ff800080')).toEqual([255, 128, 0]);
    expect(hexToRgb('nope')).toBeNull();
    expect(hexToRgb(null)).toBeNull();
  });
  it('rejects near-black and near-white', () => {
    expect(hexToTintRgb('#050505')).toBeNull();
    expect(hexToTintRgb('#fafafa')).toBeNull();
    expect(hexToTintRgb('#c83232')).toBe('200, 50, 50');
  });
  it('falls through vibrant -> dominant -> average', () => {
    expect(pickTintFromColors({ vibrant: '#000000', dominant: '#2a6df4', average: '#c83232' })).toBe('42, 109, 244');
    expect(pickTintFromColors({ vibrant: '#000000', dominant: '#ffffff', average: '#c83232' })).toBe('200, 50, 50');
    expect(pickTintFromColors({ vibrant: '#000000' })).toBeNull();
    expect(pickTintFromColors(null)).toBeNull();
  });
  it('formats rgba', () => {
    expect(rgba('1, 2, 3', 0.55)).toBe('rgba(1, 2, 3, 0.55)');
  });
});
