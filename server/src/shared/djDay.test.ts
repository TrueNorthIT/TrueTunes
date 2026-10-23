// Run: npm test (from server/) — compiles with tsc, then node:test over dist-test.
//
// D-1: "never enqueues a song ... earlier the same London calendar day
// (Europe/London, resets at local midnight)".
// Code under test: londonDayKey / londonDayStartMs in server/src/shared/djDay.ts
// (new module — currently a stub that throws NotImplemented).
import test from 'node:test';
import assert from 'node:assert/strict';
import { londonDayKey, londonDayStartMs } from './djDay';

const utc = (iso: string): number => Date.parse(iso);

// --- londonDayKey -----------------------------------------------------------

test('D-1 londonDayKey: a mid-afternoon BST instant belongs to that calendar date', () => {
  assert.equal(
    londonDayKey(utc('2026-10-20T15:00:00Z')),
    '2026-10-20',
    'Expected 15:00 UTC on 20 Oct 2026 (16:00 BST) to be London day 2026-10-20'
  );
});

test('D-1 londonDayKey: 23:00 UTC in summer is already the NEXT London day (00:00 BST)', () => {
  // Servers run in UTC. A UTC-based day would call this still the 19th.
  assert.equal(
    londonDayKey(utc('2026-10-19T23:00:00Z')),
    '2026-10-20',
    'Expected 23:00 UTC on 19 Oct (00:00 BST on the 20th) to be London day 2026-10-20'
  );
});

test('D-1 londonDayKey: one millisecond before London midnight in summer is still the previous day', () => {
  assert.equal(
    londonDayKey(utc('2026-10-19T22:59:59.999Z')),
    '2026-10-19',
    'Expected 23:59:59.999 BST on 19 Oct to be London day 2026-10-19'
  );
});

test('D-1 londonDayKey: in winter (GMT) London midnight coincides with UTC midnight', () => {
  assert.equal(londonDayKey(utc('2026-11-01T23:59:59.999Z')), '2026-11-01');
  assert.equal(
    londonDayKey(utc('2026-11-02T00:00:00Z')),
    '2026-11-02',
    'Expected 00:00 GMT on 2 Nov to start London day 2026-11-02'
  );
});

test('D-1 londonDayKey: the day clocks go back (25-hour day) runs 00:00 BST to 00:00 GMT', () => {
  // 25 Oct 2026: BST ends at 01:00 UTC. Local 23:30 that night is 23:30 UTC.
  assert.equal(londonDayKey(utc('2026-10-24T23:00:00Z')), '2026-10-25', 'start of the 25-hour day');
  assert.equal(londonDayKey(utc('2026-10-25T23:30:00Z')), '2026-10-25', 'late evening of the 25-hour day');
  assert.equal(londonDayKey(utc('2026-10-26T00:00:00Z')), '2026-10-26', 'first instant of the next day');
});

test('D-1 londonDayKey: the day clocks go forward (23-hour day) ends at 23:00 UTC', () => {
  // 28 Mar 2027: BST starts at 01:00 UTC, so local midnight on the 29th is 23:00 UTC on the 28th.
  assert.equal(londonDayKey(utc('2027-03-28T22:59:59.999Z')), '2027-03-28', 'last instant of the 23-hour day');
  assert.equal(londonDayKey(utc('2027-03-28T23:00:00Z')), '2027-03-29', 'first instant of the next day');
});

// --- londonDayStartMs -------------------------------------------------------

test('D-1/D-4 londonDayStartMs: summer day starts at 23:00 UTC the evening before', () => {
  assert.equal(
    londonDayStartMs(utc('2026-10-20T09:00:00Z')),
    utc('2026-10-19T23:00:00Z'),
    'Expected the 20 Oct (BST) day to start at 2026-10-19T23:00:00Z'
  );
});

test('D-1/D-4 londonDayStartMs: an instant exactly at London midnight returns itself', () => {
  const midnight = utc('2026-10-19T23:00:00Z');
  assert.equal(londonDayStartMs(midnight), midnight, 'Expected 00:00 BST to be its own day start');
});

test('D-1/D-4 londonDayStartMs: winter day starts at 00:00 UTC', () => {
  assert.equal(
    londonDayStartMs(utc('2026-11-02T14:30:00Z')),
    utc('2026-11-02T00:00:00Z'),
    'Expected the 2 Nov (GMT) day to start at 2026-11-02T00:00:00Z'
  );
});

test('D-1/D-4 londonDayStartMs: on the 25-hour day it starts at 23:00 UTC the evening before', () => {
  assert.equal(
    londonDayStartMs(utc('2026-10-25T12:00:00Z')),
    utc('2026-10-24T23:00:00Z'),
    'Expected 25 Oct 2026 to start at 00:00 BST, i.e. 2026-10-24T23:00:00Z'
  );
});

test('D-1/D-4 londonDayStartMs: on the 23-hour day it starts at 00:00 UTC (still GMT at midnight)', () => {
  assert.equal(
    londonDayStartMs(utc('2027-03-28T12:00:00Z')),
    utc('2027-03-28T00:00:00Z'),
    'Expected 28 Mar 2027 to start at 00:00 GMT'
  );
});

test('D-1 londonDayStartMs and londonDayKey agree: the start belongs to the day, the instant before does not', () => {
  const samples = [
    utc('2026-10-20T09:00:00Z'),
    utc('2026-11-02T14:30:00Z'),
    utc('2026-10-25T12:00:00Z'),
    utc('2027-03-28T12:00:00Z'),
    utc('2027-03-29T12:00:00Z'),
  ];
  for (const s of samples) {
    const start = londonDayStartMs(s);
    assert.equal(
      londonDayKey(start),
      londonDayKey(s),
      `day start of ${new Date(s).toISOString()} must be in the same London day`
    );
    assert.notEqual(
      londonDayKey(start - 1),
      londonDayKey(s),
      `1ms before the day start of ${new Date(s).toISOString()} must be the previous London day`
    );
  }
});
