// Run: npm test (from server/).
//
// Weekly anonymous poll: pure scheduling, visibility, validation and reorder rules in
// server/src/shared/polls.ts (new module, currently a stub whose functions throw NotImplemented).
// Requirement IDs (P-n) come from the agreed weekly-poll requirements and are kept in test names.
//
//   P-5  Scheduling: consecutive London Mondays, starting strictly after the current week and
//        after the latest live poll's week; "live" means liveFrom <= London today (DST-correct).
//   P-6  Catch-up: every live poll from the current London year that the user has not answered,
//        oldest first.
//   P-7  Polls from a previous calendar year never show.
//   P-9  Add-poll validation: question required, 2 to 6 non-empty choices.
//   P-10 Live polls are locked: reorder rejects them with 409 and never changes their liveFrom.
//   P-13 shouldPostPoll gates the daily Vestaboard post at 11:23 Europe/London on weekdays.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PollError,
  assignSchedule,
  isLive,
  londonMonday,
  londonToday,
  pollForThisWeek,
  reorder,
  shouldPostPoll,
  validatePollInput,
  visiblePolls,
} from './polls';
import { THU_2026_10_22, poll, queue } from './pollsKit.testkit';

const at = (iso: string): number => Date.parse(iso);
const none = new Set<string>();

// ---------------------------------------------------------------- londonMonday / londonToday

test('P-5 londonMonday: a Thursday maps to the Monday of that week', () => {
  assert.equal(
    londonMonday(THU_2026_10_22),
    '2026-10-19',
    'Expected Thursday 2026-10-22 to belong to the week of Monday 2026-10-19'
  );
});

test('P-5 londonMonday: a Sunday belongs to the week that began the previous Monday', () => {
  assert.equal(
    londonMonday(at('2026-10-25T12:00:00Z')),
    '2026-10-19',
    'Expected Sunday 2026-10-25 to belong to the week of Monday 2026-10-19'
  );
});

test('P-5 londonMonday: 23:30 UTC on a BST Sunday is already Monday in London', () => {
  // 2026-10-18T23:30Z = 00:30 BST on Monday 2026-10-19.
  assert.equal(
    londonMonday(at('2026-10-18T23:30:00Z')),
    '2026-10-19',
    'Expected London (BST) to be on Monday 2026-10-19 already'
  );
  assert.equal(londonToday(at('2026-10-18T23:30:00Z')), '2026-10-19', 'Expected London today to be 2026-10-19');
});

test('P-5 londonMonday: 23:30 UTC on a GMT Sunday is still Sunday in London', () => {
  // BST ended 2026-10-25 01:00Z, so 23:30Z is 23:30 GMT on Sunday 2026-10-25.
  assert.equal(
    londonMonday(at('2026-10-25T23:30:00Z')),
    '2026-10-19',
    'Expected London (GMT) to still be in the week of Monday 2026-10-19'
  );
});

test('P-5 londonMonday: the spring clock change does not shift the week', () => {
  // BST began 2026-03-29 01:00Z; 23:30Z that Sunday is 00:30 BST Monday 2026-03-30.
  assert.equal(
    londonMonday(at('2026-03-29T23:30:00Z')),
    '2026-03-30',
    'Expected 00:30 BST on Monday 2026-03-30 to be in the week of 2026-03-30'
  );
});

// ---------------------------------------------------------------- isLive

test('P-5 isLive: a poll is live from midnight London on its liveFrom Monday (GMT boundary)', () => {
  const p = { liveFrom: '2026-10-26' };
  assert.equal(isLive(p, at('2026-10-25T23:59:59Z')), false, 'Expected not live at 23:59:59 GMT on the Sunday before');
  assert.equal(isLive(p, at('2026-10-26T00:00:00Z')), true, 'Expected live at 00:00 GMT on the liveFrom Monday');
});

test('P-5 isLive: a poll is live from midnight London on its liveFrom Monday (BST boundary)', () => {
  const p = { liveFrom: '2027-03-29' };
  assert.equal(
    isLive(p, at('2027-03-28T22:59:59Z')),
    false,
    'Expected not live at 23:59:59 on Sunday 2027-03-28 (London time)'
  );
  assert.equal(isLive(p, at('2027-03-28T23:00:00Z')), true, 'Expected live at 00:00 BST on Monday 2027-03-29');
});

test('P-5 isLive: a poll whose liveFrom is in the past stays live; an unscheduled poll is never live', () => {
  assert.equal(isLive({ liveFrom: '2026-01-05' }, THU_2026_10_22), true, 'Expected an old poll to remain live');
  assert.equal(
    isLive({ liveFrom: null }, THU_2026_10_22),
    false,
    'Expected an unscheduled poll (liveFrom null) not to be live'
  );
});

// ---------------------------------------------------------------- assignSchedule

test('P-5 assignSchedule: created Thursday 2026-10-22 with nothing live, A B C get 10-26, 11-02, 11-09', () => {
  const out = assignSchedule(queue(poll('A', null), poll('B', null), poll('C', null)), THU_2026_10_22);
  assert.deepEqual(
    out.map((p) => [p.id, p.liveFrom]),
    [
      ['A', '2026-10-26'],
      ['B', '2026-11-02'],
      ['C', '2026-11-09'],
    ],
    'Expected consecutive Mondays from the first Monday strictly after the current week'
  );
});

test('P-5 assignSchedule: starts after the week of a poll already live this week', () => {
  const out = assignSchedule(queue(poll('L', '2026-10-19'), poll('A', null), poll('B', null)), THU_2026_10_22);
  assert.deepEqual(
    out.map((p) => [p.id, p.liveFrom]),
    [
      ['L', '2026-10-19'],
      ['A', '2026-10-26'],
      ['B', '2026-11-02'],
    ],
    'Expected the live poll to keep 10-19 and the next two polls to follow'
  );
});

test('P-5 assignSchedule: when the latest live poll is from an earlier week the current week is still skipped', () => {
  const out = assignSchedule(queue(poll('L', '2026-10-12'), poll('A', null)), THU_2026_10_22);
  assert.equal(
    out[1].liveFrom,
    '2026-10-26',
    'Expected A on the Monday strictly after the current week (not the current week itself)'
  );
});

test('P-5 assignSchedule: on a Monday the first new poll goes to the following Monday', () => {
  const monday = at('2026-10-26T09:00:00Z');
  const out = assignSchedule(queue(poll('A', null)), monday);
  assert.equal(
    out[0].liveFrom,
    '2026-11-02',
    'Expected "strictly after the current London week" to exclude the Monday that is today'
  );
});

test('P-5 assignSchedule: upcoming polls with stale Mondays are re-assigned in queue order', () => {
  const out = assignSchedule(queue(poll('A', '2026-12-07'), poll('B', '2026-11-02')), THU_2026_10_22);
  assert.deepEqual(
    out.map((p) => p.liveFrom),
    ['2026-10-26', '2026-11-02'],
    'Expected upcoming polls to be packed onto consecutive Mondays in queue order'
  );
});

test('P-5 assignSchedule: assignment crosses the year boundary', () => {
  const thursday = at('2026-12-24T12:00:00Z');
  const out = assignSchedule(queue(poll('A', null), poll('B', null)), thursday);
  assert.deepEqual(
    out.map((p) => p.liveFrom),
    ['2026-12-28', '2027-01-04'],
    'Expected 2026-12-28 then 2027-01-04'
  );
});

test('P-5 assignSchedule: uses the London week, not the UTC date, at the BST/GMT boundaries', () => {
  // Sunday 23:30 GMT: still the week of 2026-10-19, so the first new poll is 2026-10-26.
  assert.equal(
    assignSchedule(queue(poll('A', null)), at('2026-10-25T23:30:00Z'))[0].liveFrom,
    '2026-10-26',
    'Expected 2026-10-26 at 23:30 GMT on Sunday 2026-10-25'
  );
  // 23:30Z on a BST Sunday is already Monday 2026-10-19 in London; the first new poll is then 2026-10-26.
  assert.equal(
    assignSchedule(queue(poll('A', null)), at('2026-10-18T23:30:00Z'))[0].liveFrom,
    '2026-10-26',
    'Expected 2026-10-26 at 00:30 BST on Monday 2026-10-19'
  );
});

test('P-10 assignSchedule: live polls keep their liveFrom and the input is not mutated', () => {
  const input = queue(poll('L1', '2026-09-28'), poll('L2', '2026-10-05'), poll('A', null));
  const snapshot = structuredClone(input);
  const out = assignSchedule(input, THU_2026_10_22);
  assert.deepEqual(
    out.slice(0, 2).map((p) => p.liveFrom),
    ['2026-09-28', '2026-10-05'],
    'Expected live polls liveFrom to be untouched'
  );
  assert.deepEqual(input, snapshot, 'Expected assignSchedule not to mutate its input');
  assert.notEqual(out, input, 'Expected a new array to be returned');
});

// ---------------------------------------------------------------- visiblePolls

test('P-6 visiblePolls: every live current-year poll the user has not answered, oldest first', () => {
  const polls = [poll('c', '2026-10-12'), poll('a', '2026-08-03'), poll('b', '2026-09-14')];
  const out = visiblePolls(polls, THU_2026_10_22, none);
  assert.deepEqual(
    out.map((p) => p.id),
    ['a', 'b', 'c'],
    'Expected all three live polls offered, oldest liveFrom first, regardless of input order'
  );
});

test('P-6 visiblePolls: answered polls are not offered again', () => {
  const polls = [poll('a', '2026-08-03'), poll('b', '2026-09-14')];
  const out = visiblePolls(polls, THU_2026_10_22, new Set(['a']));
  assert.deepEqual(
    out.map((p) => p.id),
    ['b'],
    'Expected the answered poll a to be hidden'
  );
});

test('P-6 visiblePolls: polls that are not live yet are not offered', () => {
  const polls = [poll('live', '2026-10-19'), poll('next', '2026-10-26'), poll('unscheduled', null)];
  const out = visiblePolls(polls, THU_2026_10_22, none);
  assert.deepEqual(
    out.map((p) => p.id),
    ['live'],
    'Expected only the poll live from 2026-10-19 to be offered on Thursday 2026-10-22'
  );
});

test('P-6 visiblePolls: a poll becomes visible at its Monday and older unanswered polls stay in the catch-up list', () => {
  const polls = [poll('a', '2026-12-14'), poll('b', '2026-12-21'), poll('c', '2026-12-28')];
  assert.deepEqual(
    visiblePolls(polls, at('2026-12-27T12:00:00Z'), none).map((p) => p.id),
    ['a', 'b'],
    'Expected c to be hidden until Monday 2026-12-28'
  );
  assert.deepEqual(
    visiblePolls(polls, at('2026-12-28T09:00:00Z'), none).map((p) => p.id),
    ['a', 'b', 'c'],
    'Expected c to join the catch-up list on Monday 2026-12-28'
  );
});

test('P-7 visiblePolls: on 2027-01-02 a poll live from 2026-12-28 is hidden', () => {
  const out = visiblePolls([poll('last-year', '2026-12-28')], at('2027-01-02T12:00:00Z'), none);
  assert.deepEqual(out, [], 'Expected a poll from the previous calendar year never to show');
});

test('P-7 visiblePolls: the same poll was still visible on 2026-12-31', () => {
  const out = visiblePolls([poll('last-year', '2026-12-28')], at('2026-12-31T23:30:00Z'), none);
  assert.deepEqual(
    out.map((p) => p.id),
    ['last-year'],
    'Expected the poll to be visible while still in 2026'
  );
});

test('P-7 visiblePolls: in the new year only polls from the new year show', () => {
  const polls = [poll('old', '2026-12-28'), poll('new', '2027-01-04')];
  const out = visiblePolls(polls, at('2027-01-05T12:00:00Z'), none);
  assert.deepEqual(
    out.map((p) => p.id),
    ['new'],
    'Expected only the 2027 poll on 2027-01-05'
  );
});

// ---------------------------------------------------------------- pollForThisWeek / shouldPostPoll

test('P-13 pollForThisWeek: returns the poll whose liveFrom is this week Monday', () => {
  const polls = [poll('last', '2026-10-12'), poll('this', '2026-10-19'), poll('next', '2026-10-26')];
  assert.equal(
    pollForThisWeek(polls, THU_2026_10_22)?.id,
    'this',
    'Expected the poll live from 2026-10-19 on Thursday 2026-10-22'
  );
});

test('P-13 pollForThisWeek: returns undefined when no poll starts this week', () => {
  const polls = [poll('last', '2026-10-12'), poll('next', '2026-10-26')];
  assert.equal(
    pollForThisWeek(polls, THU_2026_10_22),
    undefined,
    'Expected nothing to post when no poll liveFrom is this Monday'
  );
});

const THIS_WEEK = [poll('this', '2026-10-26')];

test('P-13 shouldPostPoll: posts at 11:23 London on a weekday when a poll starts this week', () => {
  assert.equal(
    shouldPostPoll(THIS_WEEK, at('2026-10-26T11:23:00Z'))?.id,
    'this',
    'Expected a post at 11:23 GMT on Monday 2026-10-26'
  );
});

test('P-13 shouldPostPoll: the post is once per weekday, so Wednesday and Friday also qualify', () => {
  assert.equal(shouldPostPoll(THIS_WEEK, at('2026-10-28T11:23:00Z'))?.id, 'this', 'Expected a post on Wednesday');
  assert.equal(shouldPostPoll(THIS_WEEK, at('2026-10-30T11:23:00Z'))?.id, 'this', 'Expected a post on Friday');
});

test('P-13 shouldPostPoll: does not post a second before 11:23 London', () => {
  assert.equal(shouldPostPoll(THIS_WEEK, at('2026-10-26T11:22:59Z')), undefined, 'Expected no post at 11:22:59');
});

test('P-13 shouldPostPoll: still posts up to 11:37 London to allow for timer latency, but not at 11:38', () => {
  assert.equal(shouldPostPoll(THIS_WEEK, at('2026-10-26T11:37:59Z'))?.id, 'this', 'Expected a post at 11:37:59');
  assert.equal(shouldPostPoll(THIS_WEEK, at('2026-10-26T11:38:00Z')), undefined, 'Expected no post at 11:38:00');
});

test('P-13 shouldPostPoll: in BST only the 10:23 UTC firing posts', () => {
  const polls = [poll('summer', '2026-07-13')];
  assert.equal(shouldPostPoll(polls, at('2026-07-15T10:23:00Z'))?.id, 'summer', 'Expected 10:23Z (11:23 BST) to post');
  assert.equal(shouldPostPoll(polls, at('2026-07-15T11:23:00Z')), undefined, 'Expected 11:23Z (12:23 BST) not to post');
});

test('P-13 shouldPostPoll: in GMT only the 11:23 UTC firing posts', () => {
  const polls = [poll('winter', '2026-11-16')];
  assert.equal(shouldPostPoll(polls, at('2026-11-18T11:23:00Z'))?.id, 'winter', 'Expected 11:23Z (11:23 GMT) to post');
  assert.equal(shouldPostPoll(polls, at('2026-11-18T10:23:00Z')), undefined, 'Expected 10:23Z (10:23 GMT) not to post');
});

test('P-13 shouldPostPoll: over a year exactly one of the 10:23Z and 11:23Z firings posts each weekday', () => {
  // The timer is scheduled at both UTC instants; the gate must let exactly one through per weekday.
  for (let day = 0; day < 366; day++) {
    const base = Date.UTC(2026, 0, 5) + day * 86_400_000; // a UTC midnight, from Monday 2026-01-05
    const polls = [poll('p', londonMonday(base + 12 * 3_600_000))];
    const firstFiring = base + (10 * 60 + 23) * 60_000;
    const secondFiring = base + (11 * 60 + 23) * 60_000;
    const weekday = new Date(base).getUTCDay(); // 0 Sun .. 6 Sat
    const posts = [firstFiring, secondFiring].filter((t) => shouldPostPoll(polls, t) !== undefined).length;
    const expected = weekday >= 1 && weekday <= 5 ? 1 : 0;
    assert.equal(
      posts,
      expected,
      `Expected ${expected} post(s) on ${new Date(base).toISOString().slice(0, 10)} (weekday ${weekday}), got ${posts}`
    );
  }
});

test('P-13 shouldPostPoll: never posts at the weekend', () => {
  const polls = [poll('this', '2026-10-26')];
  assert.equal(shouldPostPoll(polls, at('2026-10-31T11:23:00Z')), undefined, 'Expected no post on Saturday');
  assert.equal(shouldPostPoll(polls, at('2026-11-01T11:23:00Z')), undefined, 'Expected no post on Sunday');
});

test('P-13 shouldPostPoll: nothing is posted when no poll starts this week', () => {
  assert.equal(
    shouldPostPoll([poll('last', '2026-10-19')], at('2026-10-28T11:23:00Z')),
    undefined,
    'Expected no post when the poll liveFrom is last week Monday'
  );
});

// ---------------------------------------------------------------- validatePollInput

const okInput = { question: 'Best biscuit?', choices: ['Hobnob', 'Digestive'] };

test('P-9 validatePollInput: accepts a question with 2 choices and trims whitespace', () => {
  const r = validatePollInput({ question: '  Best biscuit? ', choices: [' Hobnob ', 'Digestive'] });
  assert.deepEqual(r, { ok: true, value: okInput }, 'Expected trimmed question and choices');
});

test('P-9 validatePollInput: accepts the maximum of 6 choices', () => {
  const r = validatePollInput({ question: 'Q?', choices: ['a', 'b', 'c', 'd', 'e', 'f'] });
  assert.equal(r.ok, true, 'Expected 6 choices to be accepted');
});

test('P-9 validatePollInput: rejects 7 choices', () => {
  const r = validatePollInput({ question: 'Q?', choices: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] });
  assert.equal(r.ok, false, 'Expected 7 choices to be rejected');
  assert.ok(!r.ok && r.errors.length > 0, 'Expected at least one error message');
});

test('P-9 validatePollInput: rejects a single choice', () => {
  assert.equal(
    validatePollInput({ question: 'Q?', choices: ['only'] }).ok,
    false,
    'Expected fewer than 2 choices to be rejected'
  );
});

test('P-9 validatePollInput: rejects a missing or blank question', () => {
  assert.equal(validatePollInput({ choices: ['a', 'b'] }).ok, false, 'Expected a missing question to be rejected');
  assert.equal(
    validatePollInput({ question: '   ', choices: ['a', 'b'] }).ok,
    false,
    'Expected a whitespace-only question to be rejected'
  );
});

test('P-9 validatePollInput: rejects blank choices instead of dropping them', () => {
  assert.equal(
    validatePollInput({ question: 'Q?', choices: ['a', '  '] }).ok,
    false,
    'Expected a blank choice to be rejected'
  );
  assert.equal(
    validatePollInput({ question: 'Q?', choices: ['a', 'b', ''] }).ok,
    false,
    'Expected a trailing empty choice to be rejected'
  );
});

test('P-9 validatePollInput: rejects malformed input of the wrong types', () => {
  const bad: unknown[] = [
    null,
    undefined,
    'text',
    42,
    [],
    { question: 5, choices: ['a', 'b'] },
    { question: 'Q?', choices: 'a,b' },
    { question: 'Q?', choices: ['a', 7] },
  ];
  for (const input of bad) {
    assert.equal(validatePollInput(input).ok, false, `Expected ${JSON.stringify(input)} to be rejected`);
  }
});

// ---------------------------------------------------------------- reorder

const NOW = THU_2026_10_22;
function sample() {
  return queue(poll('L1', '2026-10-12'), poll('U1', '2026-10-26'), poll('U2', '2026-11-02'), poll('U3', '2026-11-09'));
}

test('P-9 reorder: upcoming polls are re-ordered and re-assigned consecutive Mondays', () => {
  const out = reorder(sample(), ['U3', 'U1', 'U2'], NOW);
  assert.deepEqual(
    out.map((p) => [p.id, p.liveFrom]),
    [
      ['L1', '2026-10-12'],
      ['U3', '2026-10-26'],
      ['U1', '2026-11-02'],
      ['U2', '2026-11-09'],
    ],
    'Expected U3 to take the first upcoming Monday, then U1, then U2'
  );
});

test('P-9 reorder: order is renumbered to the array index', () => {
  const out = reorder(sample(), ['U2', 'U3', 'U1'], NOW);
  assert.deepEqual(
    out.map((p) => p.order),
    [0, 1, 2, 3],
    'Expected order to equal the position in the queue'
  );
});

test('P-10 reorder: live polls stay first, unchanged, with their counts', () => {
  const polls = sample();
  polls[0] = { ...polls[0], counts: [4, 7] };
  const out = reorder(polls, ['U2', 'U1', 'U3'], NOW);
  assert.deepEqual(out[0], polls[0], 'Expected the live poll to be returned unchanged, including counts and liveFrom');
});

test('P-10 reorder: moving a live poll is rejected with 409', () => {
  assert.throws(
    () => reorder(sample(), ['L1', 'U1', 'U2', 'U3'], NOW),
    (e: unknown) => e instanceof PollError && e.status === 409,
    'Expected reorder to reject a live poll id with PollError(409)'
  );
});

test('P-9 reorder: a missing, unknown or duplicate id is rejected with 400', () => {
  const bad: string[][] = [['U1', 'U2'], ['U1', 'U2', 'U3', 'ZZ'], ['U1', 'U1', 'U2', 'U3'], ['U1', 'U2', 'ZZ'], []];
  for (const ids of bad) {
    assert.throws(
      () => reorder(sample(), ids, NOW),
      (e: unknown) => e instanceof PollError && e.status === 400,
      `Expected PollError(400) for orderedIds ${JSON.stringify(ids)}`
    );
  }
});

test('P-9 reorder: with no upcoming polls an empty order is accepted and nothing changes', () => {
  const polls = queue(poll('L1', '2026-10-05'), poll('L2', '2026-10-12'));
  assert.deepEqual(reorder(polls, [], NOW), polls, 'Expected the queue to be returned unchanged');
});

test('P-9 reorder: does not mutate its input', () => {
  const polls = sample();
  const snapshot = structuredClone(polls);
  reorder(polls, ['U3', 'U2', 'U1'], NOW);
  assert.deepEqual(polls, snapshot, 'Expected reorder not to mutate its input');
});
