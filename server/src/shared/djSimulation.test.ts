// Run: npm test (from server/).
//
// Acceptance test: a compressed office morning (09:00-10:15 BST) plus a London
// midnight rollover, driven through createDjAutoplayService by two polling
// clients with stale snapshots, a queue clear, a regroup, re-keyed uris, failed
// adds, hand-queued songs and lease swaps (djSim.testkit.ts). The full-day
// version with the real data shape is `npm run sim:dj`.
//
// Requirements: D-1 (no repeats / no collisions within the London day, across
// groups and clears), D-3 (no stalls while songs remain), D-1 reset at midnight.
// Code under test: createDjAutoplayService in server/src/shared/djAutoplayService.ts
// (new — currently a stub that throws NotImplemented).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOfficeHistory, defaultStats, runOfficeDay, type SimReport } from './djSim.testkit';

// Fixed seed so the run is repeatable; DJ_SIM_SEED=<n> probes other days.
const SEED = Number(process.env['DJ_SIM_SEED'] ?? 7);
const BST_9 = Date.UTC(2026, 9, 20, 8, 0, 0);
const BST_1015 = Date.UTC(2026, 9, 20, 9, 15, 0);
const BST_0015_NEXT = Date.UTC(2026, 9, 20, 23, 15, 0); // 00:15 BST on the 21st

function smallOffice() {
  const stats = defaultStats();
  stats.topArtists = stats.topArtists.slice(0, 25);
  stats.totalEvents = stats.topArtists.reduce((a, b) => a + b.count, 0) + 400;
  return buildOfficeHistory({ seed: SEED, now: BST_9, stats });
}

let report: SimReport | undefined;
async function morning(): Promise<SimReport> {
  report ??= await runOfficeDay({
    impl: process.env['DJ_IMPL'] === 'legacy' ? 'legacy' : 'service',
    seed: SEED,
    data: smallOffice(),
    startMs: BST_9,
    endMs: BST_1015,
    handQueued: 8,
    rollover: true,
    rolloverEndMs: BST_0015_NEXT,
  });
  return report;
}

test('D-1 simulation: no song is enqueued twice in one London day, across clears, a regroup, re-keyed uris and lease swaps', async () => {
  const r = await morning();
  for (const d of r.days) {
    assert.equal(
      d.duplicatePicks,
      0,
      `Expected no duplicate enqueue instructions on ${d.day}, got ${d.duplicatePicks} (of ${d.djPicks} picks)`
    );
    assert.equal(d.heardTwice, 0, `Expected no DJ song to play twice on ${d.day}, got ${d.heardTwice}`);
  }
});

test('D-1 simulation: the DJ never enqueues a song a person hand-queued earlier the same London day', async () => {
  const r = await morning();
  for (const d of r.days) {
    assert.equal(
      d.collisionsWithHandQueued,
      0,
      `Expected no DJ pick to collide with a hand-queued song on ${d.day}, got ${d.collisionsWithHandQueued}`
    );
  }
});

test('D-3 simulation: the DJ keeps the room supplied (no silence of two minutes or more) while unused songs remain', async () => {
  const r = await morning();
  const picks = r.days.reduce((a, d) => a + d.djPicks, 0);
  assert.ok(picks >= 20, `Expected a steady supply of DJ picks over 100 minutes, got ${picks}`);
  for (const d of r.days) {
    assert.equal(d.stalls, 0, `Expected no stall on ${d.day}, got ${d.stalls} (longest ${d.longestStallSec}s)`);
  }
});

test('D-1/D-3 simulation: the DJ keeps picking across London midnight and the new day starts a clean record', async () => {
  const r = await morning();
  assert.equal(r.days.length, 2, `Expected two London days in the run, got ${r.days.map((d) => d.day).join(', ')}`);
  const [, after] = r.days;
  assert.ok(
    after.djPicks >= 3,
    `Expected the DJ to keep supplying songs after midnight (00:00-00:15 BST), got ${after.djPicks}`
  );
  assert.equal(after.duplicatePicks, 0, 'Expected no duplicates within the new day either');
});

test('D-4 simulation: the heavy history is fetched a handful of times, not once per poll', async () => {
  const r = await morning();
  assert.ok(r.calls > 500, `test setup: expected hundreds of polls, got ${r.calls}`);
  assert.ok(
    r.heavyHistoryFetches <= Math.ceil(r.calls / 20),
    `Expected the all-time history to be cached for minutes (<= 1 fetch per 20 polls), got ${r.heavyHistoryFetches} fetches over ${r.calls} polls`
  );
});
