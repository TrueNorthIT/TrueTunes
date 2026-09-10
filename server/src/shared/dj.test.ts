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
  const many = (u: string, a: string, n: number) =>
    Array.from({ length: n }, (_, i) => ev(u, a, `${a}-${i}`));
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
  assert.ok(
    rankOfNickelback(0) < rankOfNickelback(1),
    'lower damping must favour the established DJ',
  );
});

test('strict least misery is still available', () => {
  const events = officeWithADj();
  const nickel = (groupBlend: number) =>
    buildDjSet(events, { users: ['A', 'B', 'Heavy'], groupBlend }).tracks.find(
      (t) => t.artist === 'Nickelback',
    )?.score ?? 0;

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
  const many = (u: string, a: string, n: number) =>
    Array.from({ length: n }, (_, i) => ev(u, a, `${a}-${i}`));
  const events = [
    ...many('A', 'Radiohead', 6), ...many('B', 'Radiohead', 6),
    ...many('A', 'Muse', 5), ...many('B', 'Muse', 4),
    ...many('A', 'Pixies', 4), ...many('B', 'Pixies', 5),
  ];

  const { tracks } = buildDjSet(events, { users: ['A', 'B'], perArtistMax: 3 });
  assert.ok(tracks.length >= 6, `expected a full set, got ${tracks.length}`);

  for (let i = 1; i < tracks.length; i++) {
    assert.notEqual(
      tracks[i].artist,
      tracks[i - 1].artist,
      `${tracks[i].artist} played back to back at position ${i}`,
    );
  }
});

test('a collaboration counts as the same act, not a fresh one', () => {
  const many = (u: string, a: string, n: number) =>
    Array.from({ length: n }, (_, i) => ev(u, a, `${a}-${i}`));
  const events = [
    ...many('A', 'Gorillaz', 5), ...many('B', 'Gorillaz', 5),
    // Same band, different credit string — must not become its own slot.
    ...many('A', 'Gorillaz, De La Soul', 3), ...many('B', 'Gorillaz, De La Soul', 3),
    ...many('A', 'Muse', 4), ...many('B', 'Muse', 4),
  ];

  const { tracks } = buildDjSet(events, { users: ['A', 'B'], perArtistMax: 3 });

  // Compare on the leading credited name, which is how a listener hears it.
  const act = (a: string) => a.split(',')[0].trim();
  for (let i = 1; i < tracks.length; i++) {
    assert.notEqual(
      act(tracks[i].artist),
      act(tracks[i - 1].artist),
      `${act(tracks[i].artist)} played back to back at position ${i}`,
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
  assert.deepEqual(leadScores, [...leadScores].sort((a, b) => b - a));
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
  assert.deepEqual(
    radiohead.heardTrackKeys.sort(),
    ['t1||Radiohead', 't2||Radiohead', 't3||Radiohead'],
  );
  assert.ok(radiohead.because.length > 0);
});

test('caps how many acts the caller has to browse', () => {
  const many = (u: string, a: string, n: number) =>
    Array.from({ length: n }, (_, i) => ev(u, a, `${a}-${i}`));
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
