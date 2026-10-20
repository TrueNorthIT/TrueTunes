// Run: npm test (from server/) — compiles with tsc, then node:test over dist-test.
//
// Home "Artists" grid: one tile per individual artist, never per raw credit string.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecentArtists, type RecentArtistEvent } from './recentArtists';

let ts = 1_000_000;
/** Events are fed newest-first, as the handler sorts them. */
function ev(artist: string | null | undefined, extra: Partial<RecentArtistEvent> = {}): RecentArtistEvent {
  ts -= 1000;
  return {
    eventType: 'track',
    trackName: 'T',
    artist,
    serviceId: 'svc',
    accountId: 'acc',
    artistId: 'id-primary',
    imageUrl: 'track-art',
    timestamp: ts,
    ...extra,
  };
}

test('a Sub Focus mix collapses to one tile per individual artist', () => {
  const out = buildRecentArtists([
    ev('Sub Focus, Inéz', { artistId: 'sf' }),
    ev('Sub Focus', { artistId: 'sf' }),
    ev('Sub Focus, Katy B', { artistId: 'sf' }),
    ev('John Summit, Sub Focus', { artistId: 'js' }),
  ]);
  assert.deepEqual(out.map((a) => a.artist), ['Sub Focus', 'Inéz', 'Katy B', 'John Summit']);
});

test('artistId is only attached to the primary (first-credited) artist', () => {
  const out = buildRecentArtists([ev('Sub Focus, Inéz', { artistId: 'sf' })]);
  assert.equal(out.find((a) => a.artist === 'Sub Focus')?.artistId, 'sf');
  assert.equal(out.find((a) => a.artist === 'Inéz')?.artistId, undefined);
});

test('featured artists do not get the track art as their photo', () => {
  const out = buildRecentArtists([ev('Sub Focus, Inéz', { artistId: 'sf', imageUrl: 'art' })]);
  assert.equal(out.find((a) => a.artist === 'Sub Focus')?.imageUrl, 'art');
  assert.equal(out.find((a) => a.artist === 'Inéz')?.imageUrl, undefined);
});

test('a missing primary artistId is backfilled from a later event', () => {
  const out = buildRecentArtists([
    ev('Sub Focus', { artistId: null }),
    ev('Sub Focus', { artistId: 'sf' }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].artistId, 'sf');
});

test('a featured appearance never donates its artistId to that artist', () => {
  const out = buildRecentArtists([
    ev('Inéz, Sub Focus', { artistId: 'inez' }),
    ev('Sub Focus', { artistId: 'sf' }),
  ]);
  assert.equal(out.find((a) => a.artist === 'Sub Focus')?.artistId, 'sf');
});

test('keys are case-insensitive; first (newest) spelling and lastPlayed win', () => {
  const events = [ev('sub focus'), ev('Sub Focus')];
  const out = buildRecentArtists(events);
  assert.equal(out.length, 1);
  assert.equal(out[0].artist, 'sub focus');
  assert.equal(out[0].lastPlayed, events[0].timestamp);
});

test('names with digits are not split', () => {
  const out = buildRecentArtists([ev('Maroon 5'), ev('blink-182')]);
  assert.deepEqual(out.map((a) => a.artist), ['Maroon 5', 'blink-182']);
});

test('release subtitles and metadata strings produce no tile', () => {
  assert.deepEqual(buildRecentArtists([ev('Album, 2020'), ev('A • B')]), []);
});

test('null, empty and non-track events are skipped', () => {
  const out = buildRecentArtists([
    ev(null),
    ev(undefined),
    ev(''),
    ev('   '),
    ev('Album Artist', { eventType: 'album' }),
    ev('Real Artist'),
  ]);
  assert.deepEqual(out.map((a) => a.artist), ['Real Artist']);
});

test('output is capped at 10, newest first', () => {
  const events = Array.from({ length: 15 }, (_, i) => ev(`Artist ${String.fromCharCode(65 + i)}`));
  const out = buildRecentArtists(events);
  assert.equal(out.length, 10);
  assert.equal(out[0].artist, 'Artist A');
  assert.equal(out[9].artist, 'Artist J');
  assert.ok(out.every((a, i) => i === 0 || out[i - 1].lastPlayed > a.lastPlayed));
});
