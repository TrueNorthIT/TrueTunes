import { describe, it, expect } from 'vitest';
import { pickTopResult, dedupeTracks, albumNameOf, albumSub, playlistSub } from '../searchResults';
import type { SonosItem } from '../../types/sonos';

const id = (objectId: string) => ({ objectId, serviceId: 's', accountId: 'a' });
const artist = (name: string): SonosItem => ({ type: 'ARTIST', name, id: id(`ar-${name}`), resource: { type: 'ARTIST', id: id(`ar-${name}`) } });
const album = (name: string, by = 'X'): SonosItem => ({
  type: 'ALBUM', name, artists: [{ name: by }], summary: { content: `Album • ${by}` },
  id: id(`al-${name}`), resource: { type: 'ALBUM', id: id(`al-${name}`) },
});
const track = (name: string, by: string, albumName?: string, oid = `tr-${name}-${by}-${albumName ?? ''}`): SonosItem => ({
  type: 'TRACK', name, artists: [{ name: by }],
  ...(albumName ? { album: { name: albumName, id: id(`al-${albumName}`) } } : {}),
  id: id(oid), resource: { type: 'TRACK', id: id(oid) },
});

describe('pickTopResult', () => {
  it('prefers a song that matches over the service putting artists first ("Mr Brightside")', () => {
    const items = [artist('The Killers'), artist('Matty Hinds'), track('Mr. Brightside', 'The Killers', 'Hot Fuss'), album('Mr. Brightside', 'Natalie Ivy')];
    expect(pickTopResult(items, 'Mr Brightside')?.name).toBe('Mr. Brightside');
    expect(pickTopResult(items, 'Mr Brightside')?.type).toBe('TRACK');
  });

  it('picks an artist whose name equals the query', () => {
    const items = [artist('Arctic Monkeys'), artist('Alex Turner'), track('Do I Wanna Know?', 'Arctic Monkeys', 'AM')];
    expect(pickTopResult(items, 'arctic monkeys')?.name).toBe('Arctic Monkeys');
  });

  it('picks the top artist when its name starts with the query', () => {
    expect(pickTopResult([artist('Arctic Monkeys'), artist('Alex Turner')], 'arctic')?.name).toBe('Arctic Monkeys');
  });

  it('ignores a matching artist the service ranks below its top one (a tribute act named after the song)', () => {
    const items = [artist('The Killers'), artist('Matty Hinds'), artist('Mr. Brightside'), track('Mr. Brightside', 'The Killers', 'Hot Fuss')];
    expect(pickTopResult(items, 'Mr Brightside')?.type).toBe('TRACK');
  });

  it('matches across accents both ways ("Beyonce", "Les Miserables")', () => {
    expect(pickTopResult([artist('Beyoncé'), artist('Destiny’s Child')], 'Beyonce')?.name).toBe('Beyoncé');
    expect(pickTopResult([artist('Les Misérables Cast')], 'les miserables')?.name).toBe('Les Misérables Cast');
    expect(pickTopResult([artist('Beyonce')], 'Beyoncé')?.name).toBe('Beyonce');
  });

  it('skips a matching song with no album (a video or upload) for one with an album', () => {
    const items = [
      track('Mr. Brightside', 'Lost Panda'),
      track('Mr. Brightside', 'The Killers', 'Hot Fuss'),
    ];
    expect(pickTopResult(items, 'mr brightside')?.artists?.[0].name).toBe('The Killers');
  });

  it('prefers an exact song title over one that only starts with the query', () => {
    const items = [track('Mr. Brightside (Live)', 'The Killers', 'Live'), track('Mr. Brightside', 'The Killers', 'Hot Fuss')];
    expect(pickTopResult(items, 'mr brightside')?.album).toEqual({ name: 'Hot Fuss', id: id('al-Hot Fuss') });
  });

  it('falls back to an album whose title matches', () => {
    const items = [artist('Someone'), track('Other', 'X', 'Y'), album('Favourite Worst Nightmare', 'Arctic Monkeys')];
    expect(pickTopResult(items, 'favourite worst')?.name).toBe('Favourite Worst Nightmare');
  });

  it("otherwise takes the service's first track", () => {
    const items = [artist('Someone'), album('Unrelated'), track('First', 'X'), track('Second', 'Y', 'Z')];
    expect(pickTopResult(items, 'killers brightside')?.name).toBe('First');
  });

  it('falls back to the first item when there are no tracks, and null when there is nothing', () => {
    expect(pickTopResult([artist('Someone')], 'zzz')?.name).toBe('Someone');
    expect(pickTopResult([], 'anything')).toBeNull();
  });

  it('returns null for a blank query', () => {
    expect(pickTopResult([track('A', 'B', 'C')], '   ')).toBeNull();
  });
});

describe('dedupeTracks', () => {
  it('drops a second copy of the same title, artist and album', () => {
    const items = [
      track('Do I Wanna Know?', 'Arctic Monkeys', 'AM', 'one'),
      track('Do I Wanna Know?', 'Arctic Monkeys', 'AM', 'two'),
      track('Do I Wanna Know?', 'Arctic Monkeys', 'Live at the Royal Albert Hall', 'three'),
      track('Do I Wanna Know?', 'Someone Else', 'AM', 'four'),
    ];
    const out = dedupeTracks(items);
    expect(out.map((t) => (t.id as { objectId: string }).objectId)).toEqual(['one', 'three', 'four']);
  });

  it('treats case, accents and punctuation as the same', () => {
    const out = dedupeTracks([track('Mr. Brightside', 'The Killers', 'Hot Fuss'), track('mr brightside', 'the killers', 'hot fuss', 'x')]);
    expect(out).toHaveLength(1);
  });

  it('leaves artists and albums alone', () => {
    const items = [artist('A'), artist('A'), album('B'), album('B')];
    expect(dedupeTracks(items)).toHaveLength(4);
  });
});

describe('albumNameOf', () => {
  it('reads an album object or string, and is undefined without one', () => {
    expect(albumNameOf(track('T', 'A', 'Hot Fuss'))).toBe('Hot Fuss');
    expect(albumNameOf({ type: 'TRACK', album: 'Plain' })).toBe('Plain');
    expect(albumNameOf(track('T', 'A'))).toBeUndefined();
  });
});

describe('album and playlist subtitles', () => {
  it('keeps the release type and drops the artist when it is the top artist', () => {
    expect(albumSub(album('AM', 'Arctic Monkeys'), 'Arctic Monkeys')).toBe('Album');
    expect(albumSub(album('AM', 'Arctic Monkeys'), 'arctic monkeys')).toBe('Album');
    expect(albumSub(album('Humbug', 'Arctic Monkeys'), null)).toBe('Album · Arctic Monkeys');
    expect(albumSub({ type: 'ALBUM', name: 'S', summary: { content: 'Single • Beyoncé' }, artists: [{ name: 'Beyoncé' }] }, 'Beyoncé')).toBe('Single');
  });

  it('falls back to the artists when there is no summary', () => {
    expect(albumSub({ type: 'ALBUM', name: 'S', artists: [{ name: 'A' }, { name: 'B' }] }, null)).toBe('A, B');
  });

  it('shows a playlist owner without the "Playlist" prefix', () => {
    expect(playlistSub({ type: 'PLAYLIST', summary: { content: 'Playlist • hyperyouth' } })).toBe('hyperyouth');
    expect(playlistSub({ type: 'PLAYLIST' })).toBeNull();
  });
});
