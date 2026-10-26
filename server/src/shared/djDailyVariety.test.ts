// Issue #104: "DJ always plays Incredible". Same room, same history → the opener
// must change from day to day, yet stay put within a day (preview == enqueue).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDjSet } from './dj';
import { londonDayKey } from './djDay';
import type { RawEvent } from './aggregate';

function plays(userId: string, artist: string, trackName: string, n: number): RawEvent[] {
  return Array.from({ length: n }, () => ({
    userId,
    eventType: 'track',
    artist,
    trackName,
    uri: `uri:${artist}:${trackName}`,
    artistId: `artistId:${artist}`,
  }));
}

/** Everyone plays Example Band, and one of its songs far more than the rest. */
const history: RawEvent[] = [
  ...plays('A', 'Example Band', 'Incredible', 40),
  ...plays('A', 'Example Band', 'Second Song', 8),
  ...plays('A', 'Example Band', 'Third Song', 5),
  ...plays('A', 'Example Band', 'Deep Cut', 1),
  ...plays('B', 'Example Band', 'Incredible', 20),
  ...plays('B', 'Other Act', 'Filler', 3),
];

const DAY = 24 * 60 * 60 * 1000;
const MON_0900 = Date.UTC(2026, 9, 26, 9); // 2026-10-26 09:00 London (GMT)

function opener(nowMs: number) {
  const first = buildDjSet(history, { users: ['A', 'B'], seed: londonDayKey(nowMs) }).tracks[0];
  return `${first.trackName}||${first.artist}`;
}

test('#104: the first pick differs across days for identical inputs', () => {
  const openers = Array.from({ length: 14 }, (_, d) => opener(MON_0900 + d * DAY));
  const distinct = new Set(openers);
  assert.ok(distinct.size > 1, `Expected the opener to vary over a fortnight, got ${[...distinct].join(', ')}`);
  // Rotation stays among the act's top few: a one-play deep cut never opens.
  for (const o of distinct) assert.notEqual(o, 'Deep Cut||Example Band');
  // The favourite act still opens every day; only the song rotates.
  for (const o of openers) assert.match(o, /\|\|Example Band$/);
});

test('#104: the first pick is the same twice within a London day', () => {
  for (let d = 0; d < 14; d++) {
    const morning = MON_0900 + d * DAY;
    const evening = morning + 14 * 60 * 60 * 1000; // 23:00 London, still the same day
    assert.equal(londonDayKey(morning), londonDayKey(evening), 'test setup: same London day');
    assert.equal(opener(morning), opener(evening));
  }
});

test('#104: without a seed the ranking is unchanged (most-played first)', () => {
  const first = buildDjSet(history, { users: ['A', 'B'] }).tracks[0];
  assert.equal(first.trackName, 'Incredible');
});
