#!/usr/bin/env node
// Full office-day simulation of the DJ auto-queue (09:00-18:00 BST, ~150 DJ picks
// interleaved with ~40 hand-queued songs, queue clears, a regroup, re-keyed uris,
// failed adds, two clients swapping the lease on stale snapshots, then a London
// midnight rollover).
//
//   npm run sim:dj                         # the fix (createDjAutoplayService)
//   npm run sim:dj -- --impl legacy        # today's logic, commit a669b2c (baseline)
//   npm run sim:dj -- --stats <stats-alltime.json>   # build history from real stats
//   options: --seed N  --no-rollover  --json  --quiet
//
// Needs the test build first (the npm script does it): node >= 22, no extra deps.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const sim = require(resolve(here, '../dist-test/shared/djSim.testkit.js'));

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const impl = value('impl', 'service');
if (impl !== 'service' && impl !== 'legacy') {
  console.error(`--impl must be "service" or "legacy", got "${impl}"`);
  process.exit(2);
}
const statsPath = value('stats', undefined);
const stats = statsPath ? JSON.parse(readFileSync(statsPath, 'utf8')) : undefined;
const seed = Number(value('seed', '42'));

const started = Date.now();
const report = await sim.runOfficeDay({
  impl,
  seed,
  stats,
  rollover: !flag('no-rollover'),
  progress: flag('quiet') ? undefined : (m) => console.error(m),
});

if (flag('json')) console.log(JSON.stringify(report, null, 2));
else console.log(sim.formatReport(report));
console.error(`(${((Date.now() - started) / 1000).toFixed(1)}s wall clock)`);

// Exit non-zero when a day breaks D-1 (duplicates, collisions with hand-queued songs,
// a DJ song heard twice) or the DJ stalls (> 120s of silence), so it can gate CI.
const bad = report.days.some((d) => d.duplicatePicks > 0 || d.collisionsWithHandQueued > 0 || d.heardTwice > 0 || d.stalls > 0);
process.exit(bad ? 1 : 0);
