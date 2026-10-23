// Run: npm test (from server/).
//
// Pure-function tests for the exclusion seams the DJ fix needs.
//   D-1: "never enqueues a song (identified by normalised track key = name+artist,
//        NOT uri) that was already enqueued by DJ, or queued by a person, earlier
//        the same London calendar day".
//   D-3: "DJ keeps finding candidates as the day's exclusions grow (pool widens)".
//
// Code under test:
//   - buildDjSet (server/src/shared/dj.ts): new option `excludeTrackKeys`.
//   - decideAutoplay (server/src/shared/autoplay.ts): new request field `usedKeys`
//     plus key-aware filtering of the stored `upcoming` preview.
// Both new fields are passed through casts so the suite compiles before they exist.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDjSet, type DjOptions, type DjTrack } from './dj';
import {
  decideAutoplay,
  emptySession,
  trackKey,
  ENQUEUE_TIMEOUT_MS,
  type AutoplayRequest,
  type DjSession,
} from './autoplay';
import type { RawEvent } from './aggregate';
import { buildHistory, T0, djRanking, songKey } from './djKit.testkit';

// --- buildDjSet: excludeTrackKeys ------------------------------------------

/** DjOptions with the new `excludeTrackKeys` field (Iterable of trackKey() strings). */
const withExcludedKeys = (opts: DjOptions, keys: Iterable<string>): DjOptions =>
  Object.assign({}, opts, { excludeTrackKeys: keys });

test('D-1 buildDjSet: a track named in excludeTrackKeys is never returned, whatever its uri', () => {
  const history = buildHistory({ now: T0, artists: 4, tracksPerArtist: 3 });
  const [best] = djRanking(history);
  const { tracks } = buildDjSet(
    history,
    withExcludedKeys({ users: ['Alex', 'Sam'], limit: 40, perArtistMax: 1 }, [songKey(best)])
  );
  assert.ok(tracks.length > 0, 'Expected the set to still contain other tracks');
  assert.ok(
    !tracks.some((t) => songKey(t) === songKey(best)),
    `Expected "${best.trackName}" by ${best.artist} to be excluded by name+artist key (excludeTrackKeys), but it was returned — note excludeUris alone does not do this`
  );
});

test('D-1 buildDjSet: excludeTrackKeys matches trackKey() normalisation (case and surrounding spaces ignored)', () => {
  const ev = (trackName: string): RawEvent => ({
    userId: 'Alex',
    eventType: 'track',
    trackName,
    artist: 'The  Band ',
    uri: `uri:${trackName}`,
    artistId: 'a1',
  });
  const history: RawEvent[] = [
    ...Array.from({ length: 5 }, () => ev('Loud Song ')),
    ...Array.from({ length: 3 }, () => ev('Quiet Song')),
    ...Array.from({ length: 3 }, () => ({ ...ev('Quiet Song'), userId: 'Sam' })),
  ];
  const key = trackKey('loud song', 'the  band');
  const { tracks } = buildDjSet(history, withExcludedKeys({ users: ['Alex'], limit: 10, perArtistMax: 5 }, [key]));
  assert.deepEqual(
    tracks.map((t) => t.trackName.trim()),
    ['Quiet Song'],
    'Expected "Loud Song " (trailing space, different case) to match the normalised key and be excluded'
  );
});

test("D-3 buildDjSet: with each act's best tracks excluded, the set widens to that act's next-best tracks", () => {
  const history = buildHistory({ now: T0, artists: 5, tracksPerArtist: 12 });
  const ranking = djRanking(history);
  const excluded = ranking.filter((t) => /Track \d-(0|1|2)$/.test(t.trackName)).map((t) => songKey(t));
  assert.equal(excluded.length, 15, 'test setup: 5 acts x their 3 best tracks');

  const { tracks } = buildDjSet(
    history,
    withExcludedKeys({ users: ['Alex', 'Sam'], limit: 40, perArtistMax: 1 }, excluded)
  );

  assert.equal(tracks.length, 5, 'Expected one pick per act to remain available after the exclusions');
  for (const t of tracks) {
    assert.ok(
      !excluded.includes(songKey(t)),
      `Expected ${t.artist} to offer its next unused track, but "${t.trackName}" is excluded`
    );
  }
});

test("D-3 buildDjSet: when the top 40 acts' only songs are excluded, the pool reaches further down the ranking", () => {
  const history = buildHistory({ now: T0, artists: 60, tracksPerArtist: 1 });
  const ranking = djRanking(history);
  const excluded = ranking.slice(0, 40).map((t) => songKey(t));

  const { tracks } = buildDjSet(
    history,
    withExcludedKeys({ users: ['Alex', 'Sam'], limit: 40, perArtistMax: 1 }, excluded)
  );

  assert.equal(
    tracks.length,
    20,
    `Expected the remaining 20 acts to supply candidates (got ${tracks.length}) — the DJ must not run dry while unused songs exist`
  );
  assert.ok(
    tracks.every((t) => !excluded.includes(songKey(t))),
    'Expected none of the excluded songs to be returned'
  );
});

// --- decideAutoplay: usedKeys ----------------------------------------------

const track = (uri: string, artist = 'Band'): DjTrack => ({
  uri,
  trackName: uri,
  artist,
  score: 0.5,
  because: 'the office plays this',
});
const CANDIDATES = [track('a'), track('b'), track('c'), track('d'), track('e')];
const key = (t: DjTrack): string => trackKey(t.trackName, t.artist);

/** AutoplayRequest with the new `usedKeys` field (Iterable of trackKey() strings). */
const req = (over: Partial<AutoplayRequest> = {}, usedKeys?: Iterable<string>): AutoplayRequest =>
  Object.assign(
    { clientId: 'client-1', queueUris: [] as string[], candidates: CANDIDATES },
    over,
    usedKeys ? { usedKeys } : {}
  ) as AutoplayRequest;

const enabled = (): DjSession => ({ ...emptySession('group-1'), enabled: true });

test('D-1 decideAutoplay: a candidate whose key is in usedKeys is neither enqueued nor previewed', () => {
  const d = decideAutoplay(enabled(), req({}, new Set([key(CANDIDATES[0])])), 1000);
  assert.equal(d.enqueue?.uri, 'b', 'Expected the DJ to skip the used song "a" and enqueue the next candidate');
  assert.ok(
    !d.upcoming.some((t) => t.uri === 'a'),
    `Expected the used song to be missing from the preview, got ${d.upcoming.map((t) => t.uri)}`
  );
});

test('D-1 decideAutoplay: a pick whose add never landed is not re-offered after the neverLanded timeout once its key is used', () => {
  // The coordinator tells a client to enqueue "a"; the add silently fails. 60s later
  // it releases the lease on the pick and used to re-offer the same head.
  const first = decideAutoplay(enabled(), req(), 1000);
  assert.equal(first.enqueue?.uri, 'a', 'test setup: first pick is "a"');

  const later = decideAutoplay(
    first.session,
    req({}, [key(CANDIDATES[0])]), // the day ledger recorded "a" when it was handed out
    1000 + ENQUEUE_TIMEOUT_MS + 1
  );
  assert.notEqual(
    later.enqueue?.uri,
    'a',
    'Expected the song already handed out to be skipped after the timeout, not enqueued a second time'
  );
  assert.ok(!later.upcoming.some((t) => t.uri === 'a'), 'Expected "a" to leave the preview as well');
});

test('D-1 decideAutoplay: a previewed song that becomes used (hand-queued) drops out of the stored preview', () => {
  const previewed = decideAutoplay(emptySession('group-1'), req(), 1000);
  assert.deepEqual(
    previewed.upcoming.map((t) => t.uri),
    ['a', 'b', 'c'],
    'test setup'
  );

  const later = decideAutoplay(previewed.session, req({}, [key(CANDIDATES[1])]), 2000);
  assert.deepEqual(
    later.upcoming.map((t) => t.uri),
    ['a', 'c', 'd'],
    'Expected "b" to be removed from the preview once its key is used, and the gap topped up'
  );
});

test('D-1 decideAutoplay: a previewed song that someone queued under a re-keyed uri leaves the preview', () => {
  // Sonos re-keys objectIds: the queue now holds "b" as uri "b#rk" with the same name+artist.
  const previewed = decideAutoplay(emptySession('group-1'), req(), 1000);
  const now = track('now');
  const later = decideAutoplay(
    previewed.session,
    req({
      queueUris: ['now', 'b#rk'],
      queueKeys: [key(now), key(CANDIDATES[1])],
      nowPlayingUri: 'now',
      nowPlayingKey: key(now),
      nowPlayingIndex: 0,
    }),
    2000
  );
  assert.ok(
    !later.upcoming.some((t) => t.trackName === 'b'),
    `Expected "b" (already in the queue under another uri) to leave the preview, got ${later.upcoming.map((t) => t.uri)}`
  );
});

test('D-1 decideAutoplay: the song at the head of the stored preview is skipped when it has become used before its turn', () => {
  // Preview [a,b,c]; "a" is parked. Before "a" finishes, a person queues "b" (key now used,
  // queue snapshot does not show it). When "a" is reached the DJ must not park "b".
  let d = decideAutoplay(enabled(), req(), 1000);
  assert.equal(d.enqueue?.uri, 'a', 'test setup');
  const a = CANDIDATES[0];
  // "a" lands and starts playing; the playhead is on the filler, so it is "played" and the next head is parked.
  d = decideAutoplay(
    d.session,
    req(
      { queueUris: ['a'], queueKeys: [key(a)], nowPlayingUri: 'a', nowPlayingKey: key(a), nowPlayingIndex: 0 },
      [key(a), key(CANDIDATES[1])] // "a" was handed out, "b" was hand-queued
    ),
    2000
  );
  assert.notEqual(d.enqueue?.uri, 'b', 'Expected the hand-queued song "b" not to be parked by the DJ');
  assert.equal(d.enqueue?.uri, 'c', 'Expected the next unused candidate "c" to be parked instead');
});
