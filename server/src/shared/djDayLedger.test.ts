// Run: npm test (from server/).
//
// D-2: "The day's 'already used' record is durable (Cosmos, survives restarts) and
// is written atomically (ETag/conditional) BEFORE a client is told to enqueue; if
// two clients race for the same pick only one gets enqueue=true."
// D-1: the record is per Europe/London calendar day.
//
// Code under test: reserveTrackKey / readUsedTrackKeys in
// server/src/shared/djDayLedger.ts (new module — currently a stub that throws).
// The store is the in-memory DocStore from djKit.testkit.ts, which has real ETag
// semantics and can hold every racer's read until all have read (worst case).
import test from 'node:test';
import assert from 'node:assert/strict';
import { reserveTrackKey, readUsedTrackKeys } from './djDayLedger';
import { MemoryDocStore, T0, HOUR } from './djKit.testkit';

const KEY_A = 'track a||artist a';
const KEY_B = 'track b||artist b';
const KEY_C = 'track c||artist c';

test('D-2 reserveTrackKey: the first reservation of a key resolves true', async () => {
  const store = new MemoryDocStore();
  assert.equal(await reserveTrackKey(store, T0, KEY_A), true, 'Expected a never-used key to be reserved');
});

test('D-2 reserveTrackKey: reserving a key already used today resolves false', async () => {
  const store = new MemoryDocStore();
  await reserveTrackKey(store, T0, KEY_A);
  assert.equal(
    await reserveTrackKey(store, T0 + 5 * HOUR, KEY_A),
    false,
    'Expected a second reservation of the same key on the same London day to be refused',
  );
});

test('D-2 readUsedTrackKeys: returns every key reserved earlier the same London day', async () => {
  const store = new MemoryDocStore();
  await reserveTrackKey(store, T0, KEY_A);
  await reserveTrackKey(store, T0 + HOUR, KEY_B);
  const used = await readUsedTrackKeys(store, T0 + 2 * HOUR);
  assert.deepEqual([...used].sort(), [KEY_A, KEY_B], 'Expected both reserved keys to be reported as used');
});

test('D-2 readUsedTrackKeys: an untouched store reports nothing used', async () => {
  const used = await readUsedTrackKeys(new MemoryDocStore(), T0);
  assert.equal(used.size, 0, 'Expected no used keys before anything was reserved');
});

test('D-2 ledger is durable: a fresh caller over the same store still sees the reservation', async () => {
  // Nothing is held in module state: "restart" == new calls against the same store.
  const store = new MemoryDocStore();
  await reserveTrackKey(store, T0, KEY_A);
  assert.ok(store.docs.size >= 1, 'Expected the reservation to be persisted as a document in the store');
  assert.equal(await reserveTrackKey(store, T0 + HOUR, KEY_A), false, 'Expected the persisted key to still be refused');
  assert.ok((await readUsedTrackKeys(store, T0 + HOUR)).has(KEY_A), 'Expected the persisted key to be readable');
});

test('D-1 ledger resets at London midnight: a key used yesterday can be reserved again today', async () => {
  const store = new MemoryDocStore();
  // 22:30 UTC on 19 Oct is 23:30 BST — still the 19th. 23:05 UTC is 00:05 BST on the 20th.
  const beforeMidnight = Date.UTC(2026, 9, 19, 22, 30, 0);
  const afterMidnight = Date.UTC(2026, 9, 19, 23, 5, 0);
  assert.equal(await reserveTrackKey(store, beforeMidnight, KEY_A), true);
  assert.equal(
    (await readUsedTrackKeys(store, afterMidnight)).has(KEY_A),
    false,
    'Expected yesterday\'s key to be absent from the new London day (23:05 UTC is 00:05 BST)',
  );
  assert.equal(
    await reserveTrackKey(store, afterMidnight, KEY_A),
    true,
    'Expected the key to be reservable again after London midnight',
  );
});

test('D-1 ledger keeps a London day together: 23:30 UTC and 00:30 UTC in winter are different days, 22:30 and 23:30 UTC in summer are different days', async () => {
  const store = new MemoryDocStore();
  const gmtEvening = Date.UTC(2026, 10, 1, 23, 30, 0); // 1 Nov, GMT
  const gmtMorning = Date.UTC(2026, 10, 2, 0, 30, 0); // 2 Nov, GMT
  await reserveTrackKey(store, gmtEvening, KEY_A);
  assert.equal((await readUsedTrackKeys(store, gmtMorning)).has(KEY_A), false, 'Expected 00:30 GMT on 2 Nov to be a new day');
  const bstLate = Date.UTC(2026, 9, 20, 22, 30, 0); // 23:30 BST on the 20th
  const bstNext = Date.UTC(2026, 9, 20, 23, 30, 0); // 00:30 BST on the 21st
  await reserveTrackKey(store, bstLate, KEY_B);
  assert.equal((await readUsedTrackKeys(store, bstNext)).has(KEY_B), false, 'Expected 00:30 BST on 21 Oct to be a new day');
  assert.equal((await readUsedTrackKeys(store, bstLate)).has(KEY_B), true, 'Expected 23:30 BST on 20 Oct to still see its own day');
});

test('D-2 reserveTrackKey: two clients racing for the same key — exactly one wins', async () => {
  const store = new MemoryDocStore();
  // Both racers read the (empty) ledger before either writes.
  store.holdReadsUntil(2);
  const results = await Promise.all([reserveTrackKey(store, T0, KEY_A), reserveTrackKey(store, T0, KEY_A)]);
  store.releaseReads();
  assert.deepEqual(
    results.filter(Boolean).length,
    1,
    `Expected exactly one racer to be told true, got ${JSON.stringify(results)} — the write must be conditional on the ETag (or create-if-absent), not check-then-set`,
  );
});

test('D-2 reserveTrackKey: three clients racing for the same key — exactly one wins', async () => {
  const store = new MemoryDocStore();
  store.holdReadsUntil(3);
  const results = await Promise.all([
    reserveTrackKey(store, T0, KEY_A),
    reserveTrackKey(store, T0, KEY_A),
    reserveTrackKey(store, T0, KEY_A),
  ]);
  store.releaseReads();
  assert.equal(results.filter(Boolean).length, 1, `Expected exactly one winner among three, got ${JSON.stringify(results)}`);
});

test('D-2 reserveTrackKey: concurrent reservations of DIFFERENT keys all succeed and none is lost', async () => {
  const store = new MemoryDocStore();
  store.holdReadsUntil(3);
  const results = await Promise.all([
    reserveTrackKey(store, T0, KEY_A),
    reserveTrackKey(store, T0, KEY_B),
    reserveTrackKey(store, T0, KEY_C),
  ]);
  store.releaseReads();
  assert.deepEqual(results, [true, true, true], 'Expected every distinct key to be reserved despite ETag conflicts (retry, do not give up)');
  const used = await readUsedTrackKeys(store, T0);
  assert.deepEqual([...used].sort(), [KEY_A, KEY_B, KEY_C], 'Expected no reservation to be lost to a last-writer-wins overwrite');
});

test('D-2 reserveTrackKey: rejects when the store write fails, so nobody is told a pick was reserved', async () => {
  const store = new MemoryDocStore();
  store.failWrite = () => Object.assign(new Error('Cosmos unavailable'), { statusCode: 503 });
  await assert.rejects(
    reserveTrackKey(store, T0, KEY_A),
    /Cosmos unavailable/,
    'Expected the store outage itself to surface as a rejection rather than resolving true',
  );
});
