// Run: npm run test:main
import test from 'node:test';
import assert from 'node:assert/strict';
import { singleFlight } from './single-flight.ts';

test('concurrent callers share one run and its result', async () => {
  let runs = 0;
  const flight = singleFlight(async () => {
    runs++;
    await new Promise((r) => setTimeout(r, 10));
    return 'token';
  });
  const results = await Promise.all([flight(), flight(), flight()]);
  assert.deepEqual(results, ['token', 'token', 'token']);
  assert.equal(runs, 1);
});

test('a later call starts a fresh run, after success or failure', async () => {
  let runs = 0;
  const flight = singleFlight(async () => {
    runs++;
    if (runs === 1) throw new Error('boom');
    return runs;
  });
  await assert.rejects(flight(), /boom/);
  assert.equal(await flight(), 2);
  assert.equal(await flight(), 3);
});
