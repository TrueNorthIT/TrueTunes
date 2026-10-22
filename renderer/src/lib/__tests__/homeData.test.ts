import { describe, it, expect } from 'vitest';
import {
  primaryArtistName,
  dedupeArtists,
  statsTrackToItem,
  statsArtistToItem,
  statsAlbumToItem,
  picksByPerson,
  jumpBackIn,
  capPerArtist,
  relativeDay,
  geniusFirstParagraph,
  pickReason,
  neverPlayedTag,
  indicesToUndo,
} from '../homeData';

// Production code under test: renderer/src/lib/homeData.ts (does not exist yet).
// These are the pure data functions behind the redesigned Home page ("help me pick something to queue").
// Conversions mirror the existing private converters:
//   statsTrackToSonosItem in renderer/src/components/ProfilePanel.tsx
//   toArtistItem / toAlbumItem in renderer/src/hooks/useUserStats.ts

// ─── Helpers ──────────────────────────────────────────────────────────────────

function recent(trackName: string, artist: string, lastPlayed: number, extra: Partial<RecentTrack> = {}): RecentTrack {
  return { trackName, artist, lastPlayed, ...extra };
}

function names(picks: { user: string }[]): string[] {
  return picks.map(p => p.user);
}

// ─── H-5a primaryArtistName ───────────────────────────────────────────────────

describe('H-5a primaryArtistName: returns the first name in a multi-artist credit, trimmed', () => {
  // Given a credit separated by a comma, primaryArtistName returns the first name.
  it('H-5a splits on a comma', () => {
    expect(primaryArtistName('GENERBION, Yung Lean'), 'Expected the first name before the comma').toBe('GENERBION');
  });

  it('H-5a splits on an ampersand', () => {
    expect(primaryArtistName('GENERBION & Bladee'), 'Expected the first name before "&"').toBe('GENERBION');
  });

  it('H-5a splits on " feat. "', () => {
    expect(primaryArtistName('GENERBION feat. Ecco2k'), 'Expected the first name before " feat. "').toBe('GENERBION');
  });

  it('H-5a splits on " feat " without a full stop', () => {
    expect(primaryArtistName('GENERBION feat Ecco2k'), 'Expected the first name before " feat "').toBe('GENERBION');
  });

  it('H-5a splits on " ft. "', () => {
    expect(primaryArtistName('The Prodigy ft. Flux Pavilion'), 'Expected the first name before " ft. "').toBe('The Prodigy');
  });

  it('H-5a splits on " featuring "', () => {
    expect(primaryArtistName('Linkin Park featuring Jay-Z'), 'Expected the first name before " featuring "').toBe('Linkin Park');
  });

  it('H-5a matches the feat/ft/featuring separators case-insensitively', () => {
    expect(primaryArtistName('GENERBION FEAT. Ecco2k'), 'Expected "FEAT." to split').toBe('GENERBION');
    expect(primaryArtistName('GENERBION Ft. Ecco2k'), 'Expected "Ft." to split').toBe('GENERBION');
    expect(primaryArtistName('GENERBION Featuring Ecco2k'), 'Expected "Featuring" to split').toBe('GENERBION');
  });

  it('H-5a splits on a standalone " x " between names', () => {
    expect(primaryArtistName('Keane x Everything Everything'), 'Expected the first name before " x "').toBe('Keane');
  });

  it('H-5a does not split on an "x" inside a name', () => {
    expect(primaryArtistName('Charli xcx'), 'Expected "Charli xcx" to stay whole').toBe('Charli xcx');
  });

  it('H-5a never splits on the word "and"', () => {
    expect(primaryArtistName('Marina and The Diamonds'), 'Expected "and" not to be treated as a separator').toBe('Marina and The Diamonds');
  });

  it('H-5a treats "Simon & Garfunkel" as a multi-artist credit and returns "Simon"', () => {
    expect(primaryArtistName('Simon & Garfunkel'), 'Expected the first name before "&"').toBe('Simon');
  });

  it('H-5a trims surrounding whitespace', () => {
    expect(primaryArtistName('  Fontaines D.C.  '), 'Expected surrounding whitespace to be trimmed').toBe('Fontaines D.C.');
  });

  it('H-5a returns a single-name credit unchanged', () => {
    expect(primaryArtistName('Linkin Park'), 'Expected a single artist to be returned as is').toBe('Linkin Park');
  });
});

// ─── H-5b dedupeArtists ───────────────────────────────────────────────────────

describe('H-5b dedupeArtists: one entry per primary name, compared case-insensitively', () => {
  // Given newest-first items, dedupeArtists keeps the first occurrence of each primary name.
  it('H-5b collapses credits sharing a primary name, keeping the first and replacing artist with the primary name', () => {
    const input = [
      { artist: 'GENERBION, A' },
      { artist: 'generbion & B' },
      { artist: 'Linkin Park' },
      { artist: 'GENERBION feat. C' },
    ];
    expect(dedupeArtists(input), 'Expected [GENERBION, Linkin Park] with primary names as the artist field')
      .toEqual([{ artist: 'GENERBION' }, { artist: 'Linkin Park' }]);
  });

  it('H-5b keeps the first occurrence, so its casing and other fields win', () => {
    const input = [
      { artist: 'Everything Everything & Keane', imageUrl: 'first.jpg', count: 4 },
      { artist: 'everything everything', imageUrl: 'second.jpg', count: 9 },
    ];
    expect(dedupeArtists(input), 'Expected the newest (first) entry to be kept with its own imageUrl and count')
      .toEqual([{ artist: 'Everything Everything', imageUrl: 'first.jpg', count: 4 }]);
  });

  it('H-5b preserves the input order of the surviving entries', () => {
    const input = [
      { artist: 'The Prodigy' },
      { artist: 'Yung Lean' },
      { artist: 'the prodigy ft. X' },
      { artist: 'Linkin Park' },
    ];
    expect(dedupeArtists(input).map(a => a.artist), 'Expected survivors in original order')
      .toEqual(['The Prodigy', 'Yung Lean', 'Linkin Park']);
  });

  it('H-5b does not mutate the input array or its items', () => {
    const input = [{ artist: 'GENERBION, Yung Lean' }, { artist: 'generbion & Bladee' }];
    const snapshot = JSON.parse(JSON.stringify(input));
    dedupeArtists(input);
    expect(input, 'Expected the input to be left untouched (artist must not be rewritten in place)').toEqual(snapshot);
  });

  it('H-5b returns an empty array for empty input', () => {
    expect(dedupeArtists([]), 'Expected no artists for no input').toEqual([]);
  });
});

// ─── H-2 conversions ──────────────────────────────────────────────────────────

describe('H-2 statsTrackToItem: builds a queueable SonosItem from a StatsTrack', () => {
  const track: StatsTrack = {
    trackName: 'Sandstorm',
    artist: 'Darude',
    uri: 'spotify:track:sandstorm',
    serviceId: '9',
    accountId: 'sn_1',
    artistId: 'artist-darude',
    album: 'Before the Storm',
    albumId: 'album-bts',
    imageUrl: 'https://img.example/sandstorm.jpg',
    count: 7,
  };

  it('H-2 produces a TRACK item titled with the track name', () => {
    const item = statsTrackToItem(track);
    expect(item, 'Expected an item for a track with a uri').not.toBeNull();
    expect(item?.type, 'Expected item type TRACK').toBe('TRACK');
    expect(item?.title, 'Expected title to be trackName').toBe('Sandstorm');
  });

  it('H-2 puts uri, serviceId and accountId into resource.id so the track can be queued', () => {
    const item = statsTrackToItem(track);
    expect(item?.resource?.type, 'Expected resource.type TRACK').toBe('TRACK');
    expect(item?.resource?.id, 'Expected resource.id { objectId: uri, serviceId, accountId }')
      .toEqual({ objectId: 'spotify:track:sandstorm', serviceId: '9', accountId: 'sn_1' });
  });

  // Assumption: the existing ProfilePanel converter sets no artist/image, but the brief asks for them,
  // so they follow toAlbumItem: artist as the plain name string, imageUrl passed through.
  it('H-2 carries the artist name and artwork URL onto the item', () => {
    const item = statsTrackToItem(track);
    expect(item?.artist, 'Expected artist to be the credited name').toBe('Darude');
    expect(item?.imageUrl, 'Expected imageUrl to be passed through').toBe('https://img.example/sandstorm.jpg');
  });

  it('H-2 falls back to empty strings for a missing serviceId or accountId, like the ProfilePanel converter', () => {
    const item = statsTrackToItem({ trackName: 'Firestarter', artist: 'The Prodigy', uri: 'x:fire', count: 2 });
    expect(item?.resource?.id, 'Expected missing service and account ids to become empty strings')
      .toEqual({ objectId: 'x:fire', serviceId: '', accountId: '' });
  });

  it('H-2 returns null when uri is missing, because the track cannot be queued', () => {
    const { uri: _omitted, ...noUri } = track;
    expect(statsTrackToItem(noUri), 'Expected null for a track with no uri').toBeNull();
  });

  it('H-2 returns null when uri is an empty string, because the track cannot be queued', () => {
    expect(statsTrackToItem({ ...track, uri: '' }), 'Expected null for a track with an empty uri').toBeNull();
  });
});

describe('H-2 statsArtistToItem: matches toArtistItem in useUserStats.ts', () => {
  it('H-2 produces an ARTIST item with name, title, image and resource id', () => {
    const artist: StatsArtist = {
      artist: 'Yung Lean',
      artistId: 'artist-yl',
      serviceId: '9',
      accountId: 'sn_1',
      imageUrl: 'https://img.example/yl.jpg',
      count: 12,
    };
    expect(statsArtistToItem(artist), 'Expected the same shape as toArtistItem').toEqual({
      type: 'ARTIST',
      title: 'Yung Lean',
      name: 'Yung Lean',
      imageUrl: 'https://img.example/yl.jpg',
      resource: { type: 'ARTIST', id: { objectId: 'artist-yl', serviceId: '9', accountId: 'sn_1' } },
    });
  });
});

describe('H-2 statsAlbumToItem: matches toAlbumItem in useUserStats.ts', () => {
  it('H-2 produces an ITEM_ALBUM item with title, artist, image, id and summary', () => {
    const album: StatsAlbum = {
      album: 'Hybrid Theory',
      albumId: 'album-ht',
      artist: 'Linkin Park',
      serviceId: '9',
      accountId: 'sn_1',
      imageUrl: 'https://img.example/ht.jpg',
      count: 5,
    };
    expect(statsAlbumToItem(album), 'Expected the same shape as toAlbumItem').toEqual({
      type: 'ITEM_ALBUM',
      title: 'Hybrid Theory',
      name: 'Hybrid Theory',
      artist: 'Linkin Park',
      imageUrl: 'https://img.example/ht.jpg',
      id: { objectId: 'album-ht', serviceId: '9', accountId: 'sn_1' },
      summary: { content: 'Linkin Park' },
    });
  });
});

// ─── H-3 picksByPerson ────────────────────────────────────────────────────────

describe('H-3 picksByPerson: recent tracks per person for the "what the office is playing" rail', () => {
  const people = ['Rich', 'Abbie', 'Alex'];

  it('H-3 returns people in the order given, each with their tracks', () => {
    const map = new Map<string, RecentTrack[]>([
      ['Rich', [recent('Firestarter', 'The Prodigy', 30, { uri: 'u:fire' })]],
      ['Abbie', [recent('Numb', 'Linkin Park', 20, { uri: 'u:numb' })]],
      ['Alex', [recent('Distant Past', 'Everything Everything', 10, { uri: 'u:dp' })]],
    ]);
    const result = picksByPerson(people, map);
    expect(names(result), 'Expected people in the order of the people argument').toEqual(['Rich', 'Abbie', 'Alex']);
    expect(result[1].tracks.map(t => t.trackName), 'Expected Abbie to carry her own tracks').toEqual(['Numb']);
  });

  it('H-3 orders each person\'s tracks newest first by lastPlayed', () => {
    const map = new Map([
      ['Rich', [
        recent('Old', 'GENERBION', 1, { uri: 'u:1' }),
        recent('Newest', 'Yung Lean', 99, { uri: 'u:3' }),
        recent('Middle', 'Linkin Park', 50, { uri: 'u:2' }),
      ]],
    ]);
    expect(picksByPerson(['Rich'], map)[0].tracks.map(t => t.trackName), 'Expected newest-first by lastPlayed')
      .toEqual(['Newest', 'Middle', 'Old']);
  });

  it('H-3 keeps up to 3 tracks per person by default', () => {
    const tracks = [1, 2, 3, 4, 5].map(n => recent(`Track ${n}`, 'The Prodigy', n, { uri: `u:${n}` }));
    const result = picksByPerson(['Rich'], new Map([['Rich', tracks]]));
    expect(result[0].tracks.map(t => t.trackName), 'Expected the three newest tracks by default')
      .toEqual(['Track 5', 'Track 4', 'Track 3']);
  });

  it('H-3 honours opts.perPerson', () => {
    const tracks = [1, 2, 3, 4, 5].map(n => recent(`Track ${n}`, 'The Prodigy', n, { uri: `u:${n}` }));
    const result = picksByPerson(['Rich'], new Map([['Rich', tracks]]), { perPerson: 2 });
    expect(result[0].tracks.map(t => t.trackName), 'Expected only two tracks when perPerson is 2')
      .toEqual(['Track 5', 'Track 4']);
  });

  it('H-3 de-duplicates a person\'s tracks by uri, keeping the newest play', () => {
    const map = new Map([
      ['Rich', [
        recent('Firestarter', 'The Prodigy', 10, { uri: 'u:fire' }),
        recent('Firestarter (again)', 'The Prodigy', 40, { uri: 'u:fire' }),
        recent('Numb', 'Linkin Park', 20, { uri: 'u:numb' }),
      ]],
    ]);
    const tracks = picksByPerson(['Rich'], map)[0].tracks;
    expect(tracks.map(t => t.uri), 'Expected one entry per uri').toEqual(['u:fire', 'u:numb']);
    expect(tracks[0].lastPlayed, 'Expected the most recent play of the duplicated uri to be kept').toBe(40);
  });

  it('H-3 de-duplicates tracks without a uri by lower-cased trackName plus artist', () => {
    const map = new Map([
      ['Abbie', [
        recent('Numb', 'Linkin Park', 30),
        recent('NUMB', 'linkin park', 20),
        recent('Numb', 'Another Artist', 10),
      ]],
    ]);
    const tracks = picksByPerson(['Abbie'], map)[0].tracks;
    expect(tracks.map(t => t.artist), 'Expected the case-variant duplicate dropped but a different artist kept')
      .toEqual(['Linkin Park', 'Another Artist']);
  });

  it('H-3 skips people who have no tracks', () => {
    const map = new Map<string, RecentTrack[]>([
      ['Rich', []],
      ['Abbie', [recent('Numb', 'Linkin Park', 20, { uri: 'u:numb' })]],
    ]);
    expect(names(picksByPerson(['Rich', 'Abbie'], map)), 'Expected Rich (empty list) to be skipped').toEqual(['Abbie']);
  });

  it('H-3 skips people with no map entry', () => {
    const map = new Map([['Alex', [recent('Distant Past', 'Everything Everything', 10, { uri: 'u:dp' })]]]);
    expect(names(picksByPerson(['Rich', 'Abbie', 'Alex'], map)), 'Expected people absent from the map to be skipped')
      .toEqual(['Alex']);
  });

  it('H-3 returns at most 6 people by default', () => {
    const everyone = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'];
    const map = new Map(everyone.map(p => [p, [recent('Song', 'Artist', 1, { uri: `u:${p}` })]]));
    expect(names(picksByPerson(everyone, map)), 'Expected the first six people by default')
      .toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6']);
  });

  it('H-3 honours opts.maxPeople', () => {
    const map = new Map(people.map(p => [p, [recent('Song', 'Artist', 1, { uri: `u:${p}` })]]));
    expect(names(picksByPerson(people, map, { maxPeople: 2 })), 'Expected only two people when maxPeople is 2')
      .toEqual(['Rich', 'Abbie']);
  });

  it('H-3 counts only people who have tracks towards maxPeople', () => {
    const map = new Map<string, RecentTrack[]>([
      ['Rich', []],
      ['Abbie', [recent('Numb', 'Linkin Park', 20, { uri: 'u:numb' })]],
      ['Alex', [recent('Distant Past', 'Everything Everything', 10, { uri: 'u:dp' })]],
    ]);
    expect(names(picksByPerson(people, map, { maxPeople: 2 })), 'Expected the empty-handed Rich not to use up a slot')
      .toEqual(['Abbie', 'Alex']);
  });

  it('H-3 does not mutate the input map or its track arrays', () => {
    const rich = [
      recent('Old', 'GENERBION', 1, { uri: 'u:1' }),
      recent('New', 'Yung Lean', 9, { uri: 'u:2' }),
      recent('New again', 'Yung Lean', 8, { uri: 'u:2' }),
    ];
    const snapshot = JSON.parse(JSON.stringify(rich));
    const map = new Map([['Rich', rich]]);
    picksByPerson(['Rich'], map);
    expect(rich, 'Expected the input array not to be sorted or trimmed in place').toEqual(snapshot);
    expect(map.get('Rich'), 'Expected the map entry to be the same array').toBe(rich);
  });

  it('H-3 returns an empty array when there are no people', () => {
    expect(picksByPerson([], new Map()), 'Expected no picks for no people').toEqual([]);
  });
});

// ─── H-5c jumpBackIn ──────────────────────────────────────────────────────────

describe('H-5c jumpBackIn: interleaves albums and artists, album first', () => {
  const albums = ['Hybrid Theory', 'Fat of the Land', 'Get Your Wish'];
  const artists = ['GENERBION', 'Yung Lean', 'Linkin Park', 'The Prodigy', 'Everything Everything'];
  const label = (e: { kind: string; item: string }) => `${e.kind}:${e.item}`;

  it('H-5c alternates album, artist, album, artist starting with an album', () => {
    const result = jumpBackIn(albums, artists);
    expect(result.slice(0, 4).map(label), 'Expected album/artist alternation starting with an album')
      .toEqual(['album:Hybrid Theory', 'artist:GENERBION', 'album:Fat of the Land', 'artist:Yung Lean']);
  });

  it('H-5c continues with the other list when one runs out (2 albums, 5 artists)', () => {
    const result = jumpBackIn(albums.slice(0, 2), artists);
    expect(result.map(e => e.kind), 'Expected album, artist, album, artist, artist, artist, artist')
      .toEqual(['album', 'artist', 'album', 'artist', 'artist', 'artist', 'artist']);
    expect(result.map(label).slice(3), 'Expected the remaining artists in their original order')
      .toEqual(['artist:Yung Lean', 'artist:Linkin Park', 'artist:The Prodigy', 'artist:Everything Everything']);
  });

  it('H-5c continues with albums when artists run out', () => {
    const result = jumpBackIn(albums, ['GENERBION']);
    expect(result.map(e => e.kind), 'Expected album, artist, album, album')
      .toEqual(['album', 'artist', 'album', 'album']);
  });

  it('H-5c caps the result at 12 by default', () => {
    const many = Array.from({ length: 20 }, (_, i) => `x${i}`);
    expect(jumpBackIn(many, many), 'Expected at most 12 entries by default').toHaveLength(12);
  });

  it('H-5c honours the max argument', () => {
    const result = jumpBackIn(albums, artists, 3);
    expect(result.map(label), 'Expected the first three interleaved entries when max is 3')
      .toEqual(['album:Hybrid Theory', 'artist:GENERBION', 'album:Fat of the Land']);
  });

  it('H-5c returns an empty array for empty inputs', () => {
    expect(jumpBackIn([], []), 'Expected no entries for no albums and no artists').toEqual([]);
  });

  it('H-5c returns only artists when there are no albums, and only albums when there are no artists', () => {
    expect(jumpBackIn([], ['GENERBION', 'Yung Lean']).map(label), 'Expected artists alone')
      .toEqual(['artist:GENERBION', 'artist:Yung Lean']);
    expect(jumpBackIn(['Hybrid Theory'], []).map(label), 'Expected albums alone')
      .toEqual(['album:Hybrid Theory']);
  });
});

// ─── H-2b capPerArtist ────────────────────────────────────────────────────────

describe('H-2b capPerArtist: at most N tracks per primary artist, order kept', () => {
  const t = (trackName: string, artist: string) => ({ trackName, artist });

  it('H-2b keeps the first N tracks of each artist and preserves order', () => {
    const input = [t('a1', 'Beast In Black'), t('a2', 'Beast In Black'), t('a3', 'Beast In Black'), t('b1', 'Justice'), t('a4', 'Beast In Black')];
    expect(capPerArtist(input, 2).map(x => x.trackName), 'Expected the third and fourth Beast In Black tracks dropped')
      .toEqual(['a1', 'a2', 'b1']);
  });

  it('H-2b counts by lower-cased primary artist name', () => {
    const input = [t('1', 'GENERBION, Yung Lean'), t('2', 'generbion & Bladee'), t('3', 'Generbion feat. X')];
    expect(capPerArtist(input, 2).map(x => x.trackName), 'Expected credits sharing a primary name to share a cap')
      .toEqual(['1', '2']);
  });

  it('H-2b does not mutate its input and handles empty input', () => {
    const input = [t('1', 'A'), t('2', 'A'), t('3', 'A')];
    capPerArtist(input, 1);
    expect(input, 'Expected input untouched').toHaveLength(3);
    expect(capPerArtist([], 2), 'Expected empty output for empty input').toEqual([]);
  });
});

describe('relativeDay: friendly last-played label', () => {
  const now = Date.UTC(2026, 9, 22, 12);
  const ago = (d: number) => now - d * 86_400_000;
  it('labels today, yesterday, days and weeks', () => {
    expect(relativeDay(now - 3_600_000, now), 'Expected an hour ago to read Today').toBe('Today');
    expect(relativeDay(ago(1), now), 'Expected Yesterday').toBe('Yesterday');
    expect(relativeDay(ago(3), now), 'Expected 3 days ago').toBe('3 days ago');
    expect(relativeDay(ago(8), now), 'Expected 1 week ago').toBe('1 week ago');
  });
});

describe('geniusFirstParagraph: plain text of the first description paragraph', () => {
  const root = {
    tag: 'root',
    children: [
      { tag: 'p', children: ['Hello ', { tag: 'a', attributes: { href: 'x' }, children: ['world'] }, { tag: 'br' }, 'again.'] },
      { tag: 'p', children: ['Second paragraph.'] },
    ],
  };

  it('flattens inline markup and keeps only the first paragraph', () => {
    expect(geniusFirstParagraph(root), 'Expected links and breaks flattened, second paragraph dropped').toBe('Hello world again.');
  });

  it('skips empty paragraphs', () => {
    expect(geniusFirstParagraph({ tag: 'root', children: [{ tag: 'p', children: ['  '] }, { tag: 'p', children: ['Real.'] }] }), 'Expected the first non-empty paragraph').toBe('Real.');
  });

  it('returns an empty string for null or a description with no text', () => {
    expect(geniusFirstParagraph(null), 'Expected empty for null').toBe('');
    expect(geniusFirstParagraph({ tag: 'root', children: [] }), 'Expected empty for no text').toBe('');
  });

  it('treats Genius\'s "?" placeholder (no description written) as empty', () => {
    expect(geniusFirstParagraph({ tag: 'root', children: [{ tag: 'p', children: ['?'] }] })).toBe('');
    expect(geniusFirstParagraph('?')).toBe('');
    expect(geniusFirstParagraph({ tag: 'root', children: [{ tag: 'p', children: [' ? '] }, { tag: 'p', children: ['Real.'] }] })).toBe('Real.');
  });
});

describe('pickReason: the short "why" on a pick card', () => {
  it('turns "A and B queue X — never played here" into "A & B love X"', () => {
    expect(pickReason('Rich and Alex queue Gorillaz — never played here'), 'Expected the short third-person form').toBe('Rich & Alex love Gorillaz');
    expect(pickReason('Rich queues Gorillaz'), 'Expected a singular verb for one person').toBe('Rich loves Gorillaz');
    expect(pickReason('Alex, Rich and Abbie queue Gorillaz'), 'Expected a comma then ampersand list').toBe('Alex, Rich & Abbie love Gorillaz');
  });

  it('says "You" when the viewer is the subject, never their own name', () => {
    expect(pickReason('Joe Pitts queues Gorillaz', 'Joe Pitts'), 'Expected You for a lone viewer').toBe('You love Gorillaz');
    expect(pickReason('Rich, Joe Pitts and Alex queue Justice — never played here', 'Joe Pitts'), 'Expected the viewer first, as You').toBe('You, Rich & Alex love Justice');
  });

  it('leaves text without a subject and verb alone', () => {
    expect(pickReason('Because 1'), 'Expected untouched text').toBe('Because 1');
  });
});

describe('neverPlayedTag', () => {
  it('returns the tag only for never-played picks', () => {
    expect(neverPlayedTag('Rich queues M-Beat — never played here'), 'Expected the tag').toBe('Never played here');
    expect(neverPlayedTag('Rich queues M-Beat'), 'Expected nothing for a familiar pick').toBeNull();
  });
});

describe('indicesToUndo: which queue positions to remove for an undo', () => {
  const q = (id: string, title = id, artist = 'A') => ({ track: { id, title, artist } });
  const added = (id: string, title = id, artist = 'A') => ({ id, title, artist });

  it('returns the positions of exactly the tracks that were added', () => {
    const queue = [q('a'), q('b'), q('c'), q('d'), q('e')];
    expect(indicesToUndo(queue, [added('c'), added('d')]), 'Expected positions 2 and 3').toEqual([2, 3]);
  });

  it('removes only the last copy when the track was already queued before', () => {
    const queue = [q('c'), q('x'), q('c')];
    expect(indicesToUndo(queue, [added('c')]), 'Expected only the newest copy of c').toEqual([2]);
  });

  it('still finds a track Sonos re-keyed, by title and artist', () => {
    const queue = [q('a'), q('canonical-1', 'Song', 'Band')];
    expect(indicesToUndo(queue, [added('original-1', 'Song', 'Band')]), 'Expected the re-keyed row to match by content').toEqual([1]);
  });

  it('ignores tracks that have since left the queue', () => {
    expect(indicesToUndo([q('a'), q('b')], [added('c')]), 'Expected nothing to remove').toEqual([]);
  });
});
