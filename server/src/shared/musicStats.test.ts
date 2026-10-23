import test from 'node:test';
import assert from 'node:assert/strict';
import { computeMusicStats, type MusicEvent, type TrackMeta } from './musicStats';
import { mergeTrackMeta, sanitiseTrackMeta } from './trackMeta';

// Monday 12 October 2026, 09:30 BST = 08:30 UTC.
const MON_0930 = Date.UTC(2026, 9, 12, 8, 30);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const ev = (userId: string, uri: string, artist: string, at: number, extra: Partial<MusicEvent> = {}): MusicEvent => ({
  userId,
  eventType: 'track',
  uri,
  trackName: `Song ${uri}`,
  artist,
  imageUrl: null,
  timestamp: at,
  ...extra,
});

test('busy hours use London time, Monday first', () => {
  const r = computeMusicStats([ev('a', 'u1', 'X', MON_0930), ev('a', 'u2', 'X', MON_0930 + 6 * DAY)], new Map());
  assert.equal(r.busyHours[0][9], 1); // Monday 09:00 London, not 08:00 UTC
  assert.equal(r.busyHours[6][9], 1); // Sunday
  assert.equal(r.busyHours.flat().reduce((a, b) => a + b, 0), 2);
});

test('airtime, average length and explicit share cover only known tracks', () => {
  const meta = new Map<string, TrackMeta>([
    ['u1', { durationMs: 180_000, explicit: true }],
    ['u2', { durationMs: 600_000, explicit: false }],
  ]);
  const r = computeMusicStats(
    [ev('a', 'u1', 'X', MON_0930), ev('a', 'u2', 'Y', MON_0930 + HOUR), ev('a', 'u3', 'Z', MON_0930 + 2 * HOUR)],
    meta,
  );
  const a = r.people[0];
  assert.equal(a.airtimeMs, 780_000);
  assert.equal(a.timedQueues, 2);
  assert.equal(a.avgLengthMs, 390_000);
  assert.equal(a.explicitPct, 50);
  assert.equal(r.tracksWithLength, 2);
  assert.equal(r.uniqueTracks, 3);
  assert.equal(r.longest[0].durationMs, 600_000);
  assert.equal(r.shortest[0].durationMs, 180_000);
});

test('variety, top artists and most re-queued song per person', () => {
  const r = computeMusicStats(
    [
      ev('a', 'u1', 'X', MON_0930),
      ev('a', 'u1', 'X', MON_0930 + HOUR),
      ev('a', 'u1', 'X', MON_0930 + 2 * HOUR),
      ev('a', 'u2', 'Y, Z', MON_0930 + 3 * HOUR),
    ],
    new Map(),
  );
  const a = r.people[0];
  assert.equal(a.uniqueArtists, 3); // X, Y and Z (featured artists count)
  assert.equal(a.variety, 3 / 4);
  assert.deepEqual(a.topArtists[0], { artist: 'X', count: 3 });
  assert.equal(a.mostRequeued?.trackName, 'Song u1');
  assert.equal(a.mostRequeued?.count, 3);
});

test('no most re-queued song when nothing was queued twice', () => {
  const r = computeMusicStats([ev('a', 'u1', 'X', MON_0930), ev('a', 'u2', 'X', MON_0930 + HOUR)], new Map());
  assert.equal(r.people[0].mostRequeued, null);
});

test('discoverer is whoever queued a popular artist first', () => {
  const events = [ev('early', 'u1', 'Band', MON_0930)];
  for (let i = 1; i <= 4; i++) events.push(ev('others', `u${i + 1}`, 'Band', MON_0930 + i * DAY));
  events.push(ev('early', 'u9', 'Band', MON_0930 + 9 * DAY));
  const r = computeMusicStats(events, new Map(), { popularArtistMin: 5 });
  assert.equal(r.discoverers.length, 1);
  assert.equal(r.discoverers[0].firstBy, 'early');
  assert.equal(r.discoverers[0].totalQueues, 6);
  assert.equal(r.discoverers[0].othersQueues, 4);
  // Below the threshold, nobody gets credit.
  assert.equal(computeMusicStats(events, new Map(), { popularArtistMin: 7 }).discoverers.length, 0);
});

test('taste by month groups by London month', () => {
  const r = computeMusicStats(
    [ev('a', 'u1', 'X', Date.UTC(2026, 8, 30, 12)), ev('a', 'u2', 'Y', Date.UTC(2026, 9, 1, 12))],
    new Map(),
  );
  assert.deepEqual(
    r.people[0].tasteByMonth.map((m) => [m.month, m.topArtists[0].artist]),
    [['2026-09', 'X'], ['2026-10', 'Y']],
  );
});

test('album queues count towards busy hours but not song stats', () => {
  const r = computeMusicStats(
    [ev('a', 'alb', 'X', MON_0930, { eventType: 'album' }), ev('a', 'u1', 'X', MON_0930)],
    new Map(),
  );
  assert.equal(r.totalEvents, 2);
  assert.equal(r.trackEvents, 1);
  assert.equal(r.people[0].queues, 2);
  assert.equal(r.people[0].trackQueues, 1);
});

test('track meta: keeps valid reports, drops junk, merges duplicates', () => {
  const out = sanitiseTrackMeta([
    { uri: 'ALk_ok-1', durationMs: 215_000.4 },
    { uri: 'ALk_ok-1', explicit: true },
    { uri: 'bad/slash', durationMs: 1000 },
    { uri: 'neg', durationMs: -5 },
    { uri: 'nothing' },
    'nonsense',
  ]);
  assert.deepEqual(out, [{ uri: 'ALk_ok-1', durationMs: 215_000, explicit: true }]);
  assert.deepEqual(sanitiseTrackMeta('nope'), []);
});

test('track meta: a report never erases what was already stored', () => {
  assert.deepEqual(mergeTrackMeta({ durationMs: 200_000, explicit: true }, { uri: 'x', durationMs: 201_000 }), {
    durationMs: 201_000,
    explicit: true,
  });
  assert.deepEqual(mergeTrackMeta(undefined, { uri: 'x', explicit: false }), { durationMs: null, explicit: false });
});
