// Run: npm test (from server/) — uses node:test with Node's built-in type stripping.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDjSet } from './dj';
import type { RawEvent } from './aggregate';

function ev(userId: string, artist: string, trackName: string): RawEvent {
  return {
    userId,
    eventType: 'track',
    artist,
    trackName,
    uri: `uri:${artist}:${trackName}`,
    // Real events carry this; without it an act can't be browsed for new music.
    artistId: `artistId:${artist}`,
    serviceId: '72711',
    accountId: '13',
  };
}

/** Two users share Radiohead; only A plays Muse, only B plays Pixies. */
function officeHistory(): RawEvent[] {
  return [
    ...['t1', 't2', 't3'].map((t) => ev('A', 'Radiohead', t)),
    ...['t1', 't2', 't3'].map((t) => ev('B', 'Radiohead', t)),
    ...['m1', 'm2'].map((t) => ev('A', 'Muse', t)),
    ...['p1', 'p2'].map((t) => ev('B', 'Pixies', t)),
  ];
}

test('recommends only what every listener has some affinity for', () => {
  const { tracks, listeners } = buildDjSet(officeHistory(), { users: ['A', 'B'] });

  assert.deepEqual(listeners.sort(), ['A', 'B']);
  assert.ok(tracks.length > 0, 'expected some recommendations');

  // Muse is A-only and Pixies is B-only, so least misery must rank Radiohead —
  // the shared taste — above both.
  const artists = tracks.map((t) => t.artist);
  assert.equal(artists[0], 'Radiohead');
  for (const t of tracks) assert.ok(t.score > 0, `${t.artist} scored ${t.score}`);
});

test('own taste outranks inferred taste for a single listener', () => {
  const { tracks } = buildDjSet(officeHistory(), { users: ['A'] });
  const rank = (artist: string) => tracks.findIndex((t) => t.artist === artist);

  // Pixies is a legitimate suggestion — B plays it alongside Radiohead, which is
  // exactly the co-occurrence signal we want. It just must not beat Muse, which
  // A actually plays.
  assert.ok(rank('Muse') > -1 && rank('Muse') < rank('Pixies'));
});

/**
 * Heavy has been the office DJ: far more plays than anyone, a private
 * Nickelback habit nobody has stopped, and shared ground on Radiohead.
 * Proportions mirror the real spread (heaviest queuer ~5x the lightest).
 */
function officeWithADj(): RawEvent[] {
  const many = (u: string, a: string, n: number) => Array.from({ length: n }, (_, i) => ev(u, a, `${a}-${i}`));
  return [
    ...many('Heavy', 'Nickelback', 40),
    ...many('Heavy', 'Radiohead', 15),
    ...many('Heavy', 'Muse', 8),
    ...many('A', 'Radiohead', 8),
    ...many('A', 'Muse', 5),
    ...many('B', 'Radiohead', 7),
    ...many('B', 'Pixies', 4),
  ];
}

test('a tolerated heavy queuer keeps their influence', () => {
  const { tracks } = buildDjSet(officeWithADj(), { users: ['A', 'B', 'Heavy'] });
  const artists = tracks.map((t) => t.artist);

  // Their taste earns a place in the set — they've been the DJ and nobody objected...
  assert.ok(artists.includes('Nickelback'), 'the established DJ should still get played');
  // ...but the room's shared favourite still leads it.
  assert.equal(artists[0], 'Radiohead');
});

test('influenceDamping trades the heavy queuer off against the quiet ones', () => {
  const events = officeWithADj();
  const rankOfNickelback = (influenceDamping: number) => {
    const { tracks } = buildDjSet(events, {
      users: ['A', 'B', 'Heavy'],
      perArtistMax: 1,
      influenceDamping,
    });
    return tracks.findIndex((t) => t.artist === 'Nickelback');
  };

  // damping 0 → influence tracks raw play count, so the DJ's habit climbs above
  // Pixies, which only one quiet listener plays.
  // damping 1 → every listener counted equally and it slips back below.
  assert.ok(rankOfNickelback(0) < rankOfNickelback(1), 'lower damping must favour the established DJ');
});

test('strict least misery is still available', () => {
  const events = officeWithADj();
  const nickel = (groupBlend: number) =>
    buildDjSet(events, { users: ['A', 'B', 'Heavy'], groupBlend }).tracks.find((t) => t.artist === 'Nickelback')
      ?.score ?? 0;

  // groupBlend 0 is pure minimum — the divisive pick is judged by the listener
  // who cares least about it.
  assert.ok(nickel(0) < nickel(1), 'least misery must penalise the divisive pick');
});

test('no single listener can own the room', () => {
  // Pathological: one person with 200 plays of one artist, against two others.
  const obsessive = Array.from({ length: 200 }, (_, i) => ev('Heavy', 'Nickelback', `n${i}`));
  const events = [...officeHistory(), ...obsessive, ev('Heavy', 'Radiohead', 't1')];

  const { tracks } = buildDjSet(events, { users: ['A', 'B', 'Heavy'], perArtistMax: 1 });
  const nickelShare = tracks.filter((t) => t.artist === 'Nickelback').length / tracks.length;
  assert.ok(nickelShare <= 0.5, `one listener took ${nickelShare * 100}% of the set`);
});

test('listeners with no history are dropped rather than zeroing every score', () => {
  const { tracks, listeners } = buildDjSet(officeHistory(), { users: ['A', 'B', 'NewStarter'] });
  assert.ok(!listeners.includes('NewStarter'));
  assert.ok(tracks.length > 0, 'a brand new listener must not empty the set');
});

test('excluded uris and the per-artist cap are respected', () => {
  const all = buildDjSet(officeHistory(), { users: ['A', 'B'], perArtistMax: 1 });
  const perArtist = all.tracks.filter((t) => t.artist === 'Radiohead');
  assert.equal(perArtist.length, 1);

  const excluded = buildDjSet(officeHistory(), {
    users: ['A', 'B'],
    excludeUris: all.tracks.map((t) => t.uri),
  });
  for (const t of excluded.tracks) {
    assert.ok(!all.tracks.some((p) => p.uri === t.uri), `${t.uri} should have been excluded`);
  }
});

test('never plays the same artist twice in a row', () => {
  // Each artist has several tracks, so a "drain one artist then move on" loop
  // would clump them into pairs.
  const many = (u: string, a: string, n: number) => Array.from({ length: n }, (_, i) => ev(u, a, `${a}-${i}`));
  const events = [
    ...many('A', 'Radiohead', 6),
    ...many('B', 'Radiohead', 6),
    ...many('A', 'Muse', 5),
    ...many('B', 'Muse', 4),
    ...many('A', 'Pixies', 4),
    ...many('B', 'Pixies', 5),
  ];

  const { tracks } = buildDjSet(events, { users: ['A', 'B'], perArtistMax: 3 });
  assert.ok(tracks.length >= 6, `expected a full set, got ${tracks.length}`);

  for (let i = 1; i < tracks.length; i++) {
    assert.notEqual(tracks[i].artist, tracks[i - 1].artist, `${tracks[i].artist} played back to back at position ${i}`);
  }
});

test('a collaboration counts as the same act, not a fresh one', () => {
  const many = (u: string, a: string, n: number) => Array.from({ length: n }, (_, i) => ev(u, a, `${a}-${i}`));
  const events = [
    ...many('A', 'Gorillaz', 5),
    ...many('B', 'Gorillaz', 5),
    // Same band, different credit string — must not become its own slot.
    ...many('A', 'Gorillaz, De La Soul', 3),
    ...many('B', 'Gorillaz, De La Soul', 3),
    ...many('A', 'Muse', 4),
    ...many('B', 'Muse', 4),
  ];

  const { tracks } = buildDjSet(events, { users: ['A', 'B'], perArtistMax: 3 });

  // Compare on the leading credited name, which is how a listener hears it.
  const act = (a: string) => a.split(',')[0].trim();
  for (let i = 1; i < tracks.length; i++) {
    assert.notEqual(
      act(tracks[i].artist),
      act(tracks[i - 1].artist),
      `${act(tracks[i].artist)} played back to back at position ${i}`
    );
  }
});

test('still leads with the strongest pick', () => {
  const { tracks } = buildDjSet(officeHistory(), { users: ['A', 'B'] });
  assert.equal(tracks[0].artist, 'Radiohead');

  // Round-robin deliberately breaks strict score order — the second pass returns
  // to the top artist. What must hold is that each artist's *first* appearance
  // is in descending score order, so the set opens strong and works down.
  const firstAppearance = new Map<string, number>();
  for (const t of tracks) if (!firstAppearance.has(t.artist)) firstAppearance.set(t.artist, t.score);
  const leadScores = [...firstAppearance.values()];
  assert.deepEqual(
    leadScores,
    [...leadScores].sort((a, b) => b - a)
  );
});

test('empty history returns an empty set instead of throwing', () => {
  assert.deepEqual(buildDjSet([]), { tracks: [], artists: [], listeners: [], artistsConsidered: 0 });
});

test('hands back ranked acts with what the office has already heard by them', () => {
  const { artists } = buildDjSet(officeHistory(), { users: ['A', 'B'] });

  assert.ok(artists.length > 0, 'expected acts to browse for new music');
  assert.equal(artists[0].artist, 'Radiohead');

  // The caller subtracts these to find tracks the office has never played.
  const radiohead = artists[0];
  assert.deepEqual(radiohead.heardTrackKeys.sort(), ['t1||Radiohead', 't2||Radiohead', 't3||Radiohead']);
  assert.ok(radiohead.because.length > 0);
});

test('caps how many acts the caller has to browse', () => {
  const many = (u: string, a: string, n: number) => Array.from({ length: n }, (_, i) => ev(u, a, `${a}-${i}`));
  const events = Array.from({ length: 30 }, (_, i) => [
    ...many('A', `Band${i}`, 3),
    ...many('B', `Band${i}`, 3),
  ]).flat();

  const { artists } = buildDjSet(events, { users: ['A', 'B'], artistLimit: 5 });
  assert.equal(artists.length, 5);
});

test('every pick carries a reason', () => {
  const { tracks } = buildDjSet(officeHistory(), { users: ['A', 'B'] });
  for (const t of tracks) assert.ok(t.because.length > 0);
});

// ─── fans: who is credited for a pick, with raw all-time counts ──────────────
// REQ-W2 / REQ-W3: "The tooltip lists each credited person with how many times they've
// ever queued that artist, most first" and "Every credited person is listed".
// Production code under test: `buildDjSet` in server/src/shared/dj.ts, which should set
// `fans` on every `DjTrack` and `DjArtist`: { user, count }[] sorted by count descending,
// ties by user name ascending, uncapped, only listeners in `options.users`.

function queued(user: string, artist: string, n: number): RawEvent[] {
  return Array.from({ length: n }, (_, i) => ev(user, artist, `${artist}-${user}-${i}`));
}

/** Radiohead: Dee 9, Alex 5, Bea 5 (tie), Cy 2, plus Outsider 20 who is not in the room. */
function radioheadFans(): RawEvent[] {
  return [
    ...queued('Dee', 'Radiohead', 9),
    ...queued('Bea', 'Radiohead', 5),
    ...queued('Alex', 'Radiohead', 5),
    ...queued('Cy', 'Radiohead', 2),
    ...queued('Outsider', 'Radiohead', 20),
    ...queued('Alex', 'Muse', 3),
  ];
}

const ROOM = ['Alex', 'Bea', 'Cy', 'Dee'];

test('REQ-W2: a track carries each credited listener with their raw queue count, most first, ties by name', () => {
  const { tracks } = buildDjSet(radioheadFans(), { users: ROOM });
  const radiohead = tracks.find((t) => t.artist === 'Radiohead');

  assert.ok(radiohead, 'expected a Radiohead track in the set');
  assert.deepEqual(
    radiohead.fans,
    [
      { user: 'Dee', count: 9 },
      { user: 'Alex', count: 5 },
      { user: 'Bea', count: 5 },
      { user: 'Cy', count: 2 },
    ],
    'DjTrack.fans should hold raw counts ordered count desc, then user name asc'
  );
});

test('REQ-W2: an act carries each credited listener with their raw queue count, most first, ties by name', () => {
  const { artists } = buildDjSet(radioheadFans(), { users: ROOM });
  const radiohead = artists.find((a) => a.artist === 'Radiohead');

  assert.ok(radiohead, 'expected Radiohead among the ranked acts');
  assert.deepEqual(
    radiohead.fans,
    [
      { user: 'Dee', count: 9 },
      { user: 'Alex', count: 5 },
      { user: 'Bea', count: 5 },
      { user: 'Cy', count: 2 },
    ],
    'DjArtist.fans should hold raw counts ordered count desc, then user name asc'
  );
});

test('REQ-W2: fans only lists people in the room, not everyone who ever queued the artist', () => {
  const { tracks, artists } = buildDjSet(radioheadFans(), { users: ROOM });

  for (const f of [
    tracks.find((t) => t.artist === 'Radiohead')?.fans,
    artists.find((a) => a.artist === 'Radiohead')?.fans,
  ]) {
    assert.ok(f, 'expected fans to be present');
    assert.ok(
      !f.some((x) => x.user === 'Outsider'),
      'Outsider is not in options.users so must not be credited, despite 20 queues'
    );
  }
});

test("REQ-W2: fans counts are the listener's raw count, not the damped weight", () => {
  // One listener with a huge habit: damping would flatten this, the raw count must not be.
  const events = [...queued('Alex', 'Radiohead', 40), ...queued('Bea', 'Radiohead', 1)];
  const { artists } = buildDjSet(events, { users: ['Alex', 'Bea'] });

  assert.deepEqual(
    artists.find((a) => a.artist === 'Radiohead')?.fans,
    [
      { user: 'Alex', count: 40 },
      { user: 'Bea', count: 1 },
    ],
    'expected raw counts 40 and 1 regardless of influence damping'
  );
});

test('REQ-W3: fans is uncapped, so five fans are all listed', () => {
  const room = ['U1', 'U2', 'U3', 'U4', 'U5'];
  const events = room.flatMap((u, i) => queued(u, 'Radiohead', i + 1));
  const { tracks, artists } = buildDjSet(events, { users: room });

  assert.equal(
    tracks.find((t) => t.artist === 'Radiohead')?.fans?.length,
    5,
    'DjTrack.fans must list all five credited listeners, not truncate'
  );
  assert.equal(
    artists.find((a) => a.artist === 'Radiohead')?.fans?.length,
    5,
    'DjArtist.fans must list all five credited listeners, not truncate'
  );
});

test('REQ-W6: a pick nobody in the room plays has an empty fans array, not undefined', () => {
  // Pixies is only played by B; for a room of just A it is recommended by similarity alone.
  const { tracks, artists } = buildDjSet(officeHistory(), { users: ['A'] });
  const pixiesTrack = tracks.find((t) => t.artist === 'Pixies');
  const pixiesAct = artists.find((a) => a.artist === 'Pixies');

  assert.ok(pixiesTrack, 'expected a Pixies track recommended to A by similarity');
  assert.deepEqual(pixiesTrack.fans, [], 'DjTrack.fans should be [] when nobody is credited');
  assert.ok(pixiesAct, 'expected Pixies among the ranked acts for A');
  assert.deepEqual(pixiesAct.fans, [], 'DjArtist.fans should be [] when nobody is credited');
});

// ─── trackFans: who in the room has queued this very track ───────────────────

function trackEvents(user: string, artist: string, trackName: string, n: number): RawEvent[] {
  return Array.from({ length: n }, () => ev(user, artist, trackName));
}

test('trackFans lists room members who queued this track, raw count desc then name asc, excluding outsiders', () => {
  const events = [
    ...trackEvents('Dee', 'Radiohead', 'Creep', 3),
    ...trackEvents('Bea', 'Radiohead', 'Creep', 1),
    ...trackEvents('Alex', 'Radiohead', 'Creep', 1),
    ...trackEvents('Outsider', 'Radiohead', 'Creep', 9),
    ...trackEvents('Cy', 'Radiohead', 'Karma Police', 4),
  ];
  const { tracks } = buildDjSet(events, { users: ROOM, perArtistMax: 5 });
  const creep = tracks.find((t) => t.trackName === 'Creep');
  assert.deepEqual(creep?.trackFans, [
    { user: 'Dee', count: 3 },
    { user: 'Alex', count: 1 },
    { user: 'Bea', count: 1 },
  ]);
  const karma = tracks.find((t) => t.trackName === 'Karma Police');
  assert.deepEqual(karma?.trackFans, [{ user: 'Cy', count: 4 }]);
});

test('trackFans is [] when nobody in the room queued the track', () => {
  const events = [
    ...trackEvents('Outsider', 'Radiohead', 'Creep', 2),
    ...trackEvents('Alex', 'Radiohead', 'Karma Police', 2),
  ];
  const { tracks } = buildDjSet(events, { users: ROOM, perArtistMax: 5 });
  assert.deepEqual(tracks.find((t) => t.trackName === 'Creep')?.trackFans, []);
});
