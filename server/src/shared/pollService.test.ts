// Run: npm test (from server/).
//
// HTTP-level behaviour of the weekly anonymous poll, in server/src/shared/pollService.ts
// (new module, createPollService currently throws NotImplemented). The Azure function in
// functions/polls.ts is a thin wrapper over these methods. All tests use an in-memory
// PollStore (pollsKit.testkit.ts) that records every write.
//
//   P-2  The client is offered live polls with question and choices.
//   P-3  Anonymity: an answer ONLY increments counts[choice] (store.incrementCount); no other
//        write, no user data, no timestamp, no per-answer record, nothing logged about the user
//        or the chosen answer; invalid choice / unknown or not-live poll -> 400/404, no change.
//   P-5  New polls are scheduled onto consecutive London Mondays.
//   P-6  GET returns every live current-year poll, oldest first. (P-7: previous-year polls hidden.)
//   P-9  Admin: list in schedule order, create/edit/delete upcoming polls, reorder.
//   P-10 Live polls are locked: edit, delete and reorder are rejected with 409 and nothing changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPollService } from './pollService';
import type { PollService } from './pollService';
import type { Poll } from './polls';
import { MemoryPollStore, THU_2026_10_22, makeIdGenerator, poll, queue } from './pollsKit.testkit';

const at = (iso: string): number => Date.parse(iso);

function setup(initial: Poll[] = [], now: number = THU_2026_10_22) {
  const store = new MemoryPollStore(initial);
  const logs: string[] = [];
  const clock = { now };
  const service: PollService = createPollService({
    store,
    now: () => clock.now,
    newId: makeIdGenerator(),
    log: (message, ...args) => logs.push([message, ...args.map((a) => JSON.stringify(a))].join(' ')),
  });
  return { store, service, logs, clock };
}

const SECRET_CHOICE = 'Zebra-Crossing-Choice';
const USER = 'Richard Kelsey';
const answerable = (): Poll[] =>
  queue(
    poll('live', '2026-10-19', {
      question: 'Cross where?',
      choices: ['Pelican', SECRET_CHOICE, 'Puffin'],
      counts: [0, 0, 0],
    }),
    poll('next', '2026-10-26')
  );

// ---------------------------------------------------------------- GET live polls (P-2, P-6, P-7)

test('P-2 listLive: returns id, question, choices and liveFrom for a live poll', async () => {
  const { service } = setup(answerable());
  const res = await service.listLive();
  assert.equal(res.status, 200, 'Expected 200');
  assert.deepEqual(
    res.body.polls,
    [{ id: 'live', question: 'Cross where?', choices: ['Pelican', SECRET_CHOICE, 'Puffin'], liveFrom: '2026-10-19' }],
    'Expected exactly the four public fields of the one live poll'
  );
});

test('P-3 listLive: never exposes counts, order or any other internal field', async () => {
  const { service } = setup([poll('live', '2026-10-19', { counts: [11, 22] })]);
  const res = await service.listLive();
  const text = JSON.stringify(res.body);
  assert.ok(!text.includes('counts'), 'Expected no counts property in the live poll response');
  assert.ok(!text.includes('11') && !text.includes('22'), 'Expected no count values in the live poll response');
  assert.deepEqual(
    Object.keys(res.body.polls[0]).sort(),
    ['choices', 'id', 'liveFrom', 'question'],
    'Expected only id, question, choices, liveFrom'
  );
});

test('P-6 listLive: every live poll of the current year, oldest first; upcoming polls are not listed', async () => {
  const { service } = setup(
    queue(poll('c', '2026-10-12'), poll('a', '2026-08-03'), poll('b', '2026-09-14'), poll('future', '2026-10-26'))
  );
  const res = await service.listLive();
  assert.deepEqual(
    res.body.polls.map((p) => p.id),
    ['a', 'b', 'c'],
    'Expected the three live polls oldest liveFrom first and no upcoming poll'
  );
});

test('P-7 listLive: on 2027-01-02 a poll live from 2026-12-28 is not returned', async () => {
  const { service } = setup(queue(poll('last-year', '2026-12-28')), at('2027-01-02T12:00:00Z'));
  const res = await service.listLive();
  assert.deepEqual(res.body.polls, [], 'Expected a previous-year poll never to be offered');
});

// ---------------------------------------------------------------- POST answer (P-3)

test('P-3 answer: increments only the chosen count and returns 200', async () => {
  const { service, store } = setup(answerable());
  const res = await service.answer({ pollId: 'live', choice: 1 });
  assert.equal(res.status, 200, 'Expected 200 for a valid answer');
  assert.deepEqual(store.docs.get('live')?.counts, [0, 1, 0], 'Expected only counts[1] to go from 0 to 1');
});

test('P-3 answer: answers accumulate', async () => {
  const { service, store } = setup(answerable());
  await service.answer({ pollId: 'live', choice: 2 });
  await service.answer({ pollId: 'live', choice: 2 });
  await service.answer({ pollId: 'live', choice: 0 });
  assert.deepEqual(store.docs.get('live')?.counts, [1, 0, 2], 'Expected counts [1, 0, 2] after three answers');
});

test('P-3 answer: the ONLY store write is one incrementCount for that poll and index', async () => {
  const { service, store } = setup(answerable());
  await service.answer({ pollId: 'live', choice: 1 });
  assert.deepEqual(
    store.writes(),
    [{ op: 'incrementCount', id: 'live', index: 1 }],
    'Expected a single atomic incrementCount(live, 1) and no create/replace/remove (no per-answer record, no read-modify-write)'
  );
});

test('P-3 answer: the poll document is unchanged apart from the one count (no timestamp, no user fields)', async () => {
  const before = answerable();
  const { service, store } = setup(before);
  await service.answer({ pollId: 'live', choice: 1 });
  const after = store.docs.get('live') as Poll;
  assert.deepEqual(
    Object.keys(after).sort(),
    Object.keys(before[0]).sort(),
    'Expected no new properties on the poll document'
  );
  assert.deepEqual(
    { ...after, counts: null },
    { ...before[0], counts: null },
    'Expected everything but counts to be identical'
  );
  assert.equal(store.docs.size, before.length, 'Expected no new documents (no per-answer record)');
});

test('P-3 answer: extra properties in the body (such as a user name) are ignored and never stored or logged', async () => {
  const { service, store, logs } = setup(answerable());
  const res = await service.answer({ pollId: 'live', choice: 1, userName: USER, oid: 'abc-123', timestamp: 1 });
  assert.equal(res.status, 200, 'Expected the answer to succeed');
  const everything = JSON.stringify([...store.docs.values()]) + JSON.stringify(store.writes()) + logs.join('\n');
  assert.ok(
    !everything.includes(USER) && !everything.includes('abc-123'),
    'Expected no user identity in the store or the logs'
  );
});

test('P-3 answer: nothing logged contains the chosen answer', async () => {
  const { service, logs } = setup(answerable());
  await service.answer({ pollId: 'live', choice: 1 });
  await service.answer({ pollId: 'live', choice: 99 });
  assert.ok(!logs.join('\n').includes(SECRET_CHOICE), 'Expected no log line to contain the text of the chosen answer');
  assert.ok(!/choice\W*1\b/i.test(logs.join('\n')), 'Expected no log line to record which choice index was picked');
});

test('P-3 answer: an out-of-range or non-integer choice is a 400 and changes nothing', async () => {
  for (const choice of [-1, 3, 1.5, '1', null, undefined, Number.NaN, {}, [1]]) {
    const { service, store } = setup(answerable());
    const res = await service.answer({ pollId: 'live', choice });
    assert.equal(res.status, 400, `Expected 400 for choice ${JSON.stringify(choice)}`);
    assert.deepEqual(store.writes(), [], `Expected no write for choice ${JSON.stringify(choice)}`);
  }
});

test('P-3 answer: a malformed body is a 400 and changes nothing', async () => {
  for (const body of [null, undefined, 'x', 7, [], {}, { choice: 0 }, { pollId: 5, choice: 0 }]) {
    const { service, store } = setup(answerable());
    const res = await service.answer(body);
    assert.equal(res.status, 400, `Expected 400 for body ${JSON.stringify(body)}`);
    assert.deepEqual(store.writes(), [], `Expected no write for body ${JSON.stringify(body)}`);
  }
});

test('P-3 answer: an unknown poll is a 404 and changes nothing', async () => {
  const { service, store } = setup(answerable());
  const res = await service.answer({ pollId: 'nope', choice: 0 });
  assert.equal(res.status, 404, 'Expected 404 for an unknown poll');
  assert.deepEqual(store.writes(), [], 'Expected no write');
});

test('P-3 answer: a poll that is not live yet is a 404 and changes nothing', async () => {
  const { service, store } = setup(answerable());
  const res = await service.answer({ pollId: 'next', choice: 0 });
  assert.equal(res.status, 404, 'Expected 404 for a poll whose liveFrom is in the future');
  assert.deepEqual(store.docs.get('next')?.counts, [0, 0], 'Expected counts untouched');
  assert.deepEqual(store.writes(), [], 'Expected no write');
});

test('P-3 answer: concurrent answers are never lost', async () => {
  const { service, store } = setup(answerable());
  await Promise.all(Array.from({ length: 25 }, () => service.answer({ pollId: 'live', choice: 0 })));
  assert.equal(store.docs.get('live')?.counts[0], 25, 'Expected all 25 concurrent answers to be counted');
});

// ---------------------------------------------------------------- admin list (P-9, P-10)

test('P-9 adminList: lists every poll in schedule order with liveFrom and a live flag, and no counts', async () => {
  const { service } = setup(
    queue(poll('L', '2026-10-12', { counts: [5, 6] }), poll('U1', '2026-10-26'), poll('U2', '2026-11-02'))
  );
  const res = await service.adminList();
  assert.equal(res.status, 200, 'Expected 200');
  assert.deepEqual(
    res.body.polls.map((p) => [p.id, p.liveFrom, p.live]),
    [
      ['L', '2026-10-12', true],
      ['U1', '2026-10-26', false],
      ['U2', '2026-11-02', false],
    ],
    'Expected schedule order with the live flag set only for the poll that is already live'
  );
  assert.ok(
    !JSON.stringify(res.body).includes('counts'),
    'Expected the admin list not to expose counts (there is no results UI)'
  );
});

test('P-9 adminList: lists polls from previous years too', async () => {
  const { service } = setup(queue(poll('old', '2025-12-29'), poll('new', '2026-10-19')));
  const res = await service.adminList();
  assert.deepEqual(
    res.body.polls.map((p) => p.id),
    ['old', 'new'],
    'Expected the admin to see every poll regardless of year'
  );
});

// ---------------------------------------------------------------- create (P-5, P-9)

const input = (q: string) => ({ question: q, choices: ['Yes', 'No'] });

test('P-5 create: three polls created on Thursday 2026-10-22 get 10-26, 11-02, 11-09', async () => {
  const { service, store } = setup();
  const a = await service.create(input('A?'));
  const b = await service.create(input('B?'));
  const c = await service.create(input('C?'));
  assert.deepEqual([a.status, b.status, c.status], [201, 201, 201], 'Expected 201 for each create');
  assert.deepEqual(
    store.ordered().map((p) => [p.question, p.liveFrom]),
    [
      ['A?', '2026-10-26'],
      ['B?', '2026-11-02'],
      ['C?', '2026-11-09'],
    ],
    'Expected the queue in creation order on consecutive Mondays'
  );
});

test('P-5 create: a new poll is scheduled after the poll that is live this week', async () => {
  const { service } = setup(queue(poll('L', '2026-10-19')));
  const res = await service.create(input('Next?'));
  assert.equal(
    (res.body as { poll: { liveFrom: string } }).poll.liveFrom,
    '2026-10-26',
    "Expected the first Monday strictly after the live poll's week"
  );
});

test('P-9 create: stores zero counts, trimmed text and returns the new poll without counts', async () => {
  const { service, store } = setup();
  const res = await service.create({ question: '  Best biscuit? ', choices: [' Hobnob ', 'Digestive', 'Rich Tea'] });
  assert.equal(res.status, 201, 'Expected 201');
  const stored = store.ordered()[0];
  assert.equal(stored.question, 'Best biscuit?', 'Expected the question to be trimmed');
  assert.deepEqual(stored.choices, ['Hobnob', 'Digestive', 'Rich Tea'], 'Expected the choices to be trimmed');
  assert.deepEqual(stored.counts, [0, 0, 0], 'Expected one zero count per choice');
  const created = (res.body as unknown as { poll: Record<string, unknown> }).poll;
  assert.equal(created['id'], stored.id, 'Expected the response to carry the stored id');
  assert.equal(created['live'], false, 'Expected the new poll to be flagged as not live');
  assert.ok(!('counts' in created), 'Expected the response not to include counts');
});

test('P-9 create: invalid input is a 400 and nothing is stored', async () => {
  for (const bad of [
    { question: '', choices: ['a', 'b'] },
    { question: 'Q?', choices: ['a'] },
    { question: 'Q?', choices: ['a', ''] },
    null,
  ]) {
    const { service, store } = setup();
    const res = await service.create(bad);
    assert.equal(res.status, 400, `Expected 400 for ${JSON.stringify(bad)}`);
    assert.deepEqual(store.writes(), [], `Expected nothing stored for ${JSON.stringify(bad)}`);
  }
});

// ---------------------------------------------------------------- update (P-9, P-10)

test("P-9 update: an upcoming poll's question and choices can be edited; its Monday does not change", async () => {
  const { service, store } = setup(queue(poll('U1', '2026-10-26'), poll('U2', '2026-11-02')));
  const res = await service.update('U1', { question: 'New question?', choices: ['x', 'y', 'z'] });
  assert.equal(res.status, 200, 'Expected 200');
  const stored = store.docs.get('U1') as Poll;
  assert.equal(stored.question, 'New question?', 'Expected the question to change');
  assert.deepEqual(stored.choices, ['x', 'y', 'z'], 'Expected the choices to change');
  assert.deepEqual(stored.counts, [0, 0, 0], 'Expected counts to match the new number of choices');
  assert.equal(stored.liveFrom, '2026-10-26', 'Expected liveFrom to stay put');
});

test('P-10 update: a live poll is rejected with 409 and unchanged', async () => {
  const { service, store } = setup(queue(poll('L', '2026-10-19', { counts: [3, 4] })));
  const before = structuredClone(store.docs.get('L'));
  const res = await service.update('L', input('Changed?'));
  assert.equal(res.status, 409, 'Expected 409 when editing a live poll');
  assert.deepEqual(store.docs.get('L'), before, 'Expected the live poll to be untouched');
  assert.deepEqual(store.writes(), [], 'Expected no write');
});

test('P-9 update: an unknown poll is a 404 and invalid input is a 400', async () => {
  const { service, store } = setup(queue(poll('U1', '2026-10-26')));
  assert.equal((await service.update('nope', input('Q?'))).status, 404, 'Expected 404 for an unknown poll');
  assert.equal(
    (await service.update('U1', { question: '', choices: ['a', 'b'] })).status,
    400,
    'Expected 400 for an empty question'
  );
  assert.deepEqual(store.writes(), [], 'Expected no write');
});

// ---------------------------------------------------------------- remove (P-9, P-10, P-5)

test('P-9 remove: an upcoming poll is deleted', async () => {
  const { service, store } = setup(queue(poll('U1', '2026-10-26'), poll('U2', '2026-11-02')));
  const res = await service.remove('U1');
  assert.equal(res.status, 200, 'Expected 200');
  assert.deepEqual([...store.docs.keys()], ['U2'], 'Expected only U2 to remain');
});

test('P-5 remove: later upcoming polls move up onto the freed Monday', async () => {
  const { service, store } = setup(queue(poll('A', '2026-10-26'), poll('B', '2026-11-02'), poll('C', '2026-11-09')));
  await service.remove('B');
  assert.deepEqual(
    store.ordered().map((p) => [p.id, p.liveFrom, p.order]),
    [
      ['A', '2026-10-26', 0],
      ['C', '2026-11-02', 1],
    ],
    "Expected C to take B's Monday so the schedule has no gap, with order renumbered"
  );
});

test('P-10 remove: a live poll is rejected with 409 and kept', async () => {
  const { service, store } = setup(queue(poll('L', '2026-10-19')));
  const res = await service.remove('L');
  assert.equal(res.status, 409, 'Expected 409 when deleting a live poll');
  assert.ok(store.docs.has('L'), 'Expected the live poll to remain');
});

test('P-9 remove: an unknown poll is a 404', async () => {
  const { service } = setup();
  assert.equal((await service.remove('nope')).status, 404, 'Expected 404 for an unknown poll');
});

// ---------------------------------------------------------------- reorder (P-9, P-10, P-5)

const upcoming = () =>
  queue(poll('L', '2026-10-12'), poll('A', '2026-10-26'), poll('B', '2026-11-02'), poll('C', '2026-11-09'));

test('P-9 reorder: re-orders upcoming polls and re-assigns their Mondays', async () => {
  const { service, store } = setup(upcoming());
  const res = await service.reorder({ orderedIds: ['C', 'A', 'B'] });
  assert.equal(res.status, 200, 'Expected 200');
  assert.deepEqual(
    store.ordered().map((p) => [p.id, p.liveFrom]),
    [
      ['L', '2026-10-12'],
      ['C', '2026-10-26'],
      ['A', '2026-11-02'],
      ['B', '2026-11-09'],
    ],
    'Expected C first among the upcoming polls and Mondays re-assigned in that order'
  );
  assert.deepEqual(
    (res.body as { polls: Array<{ id: string }> }).polls.map((p) => p.id),
    ['L', 'C', 'A', 'B'],
    'Expected the response to return the full queue in the new order'
  );
});

test('P-10 reorder: including a live poll is a 409 and nothing changes', async () => {
  const { service, store } = setup(upcoming());
  const res = await service.reorder({ orderedIds: ['L', 'A', 'B', 'C'] });
  assert.equal(res.status, 409, 'Expected 409 when a live poll is part of the reorder');
  assert.deepEqual(store.writes(), [], 'Expected no write');
});

test('P-10 reorder: the live poll document is never rewritten', async () => {
  const { service, store } = setup(upcoming());
  await service.reorder({ orderedIds: ['B', 'C', 'A'] });
  const rewritten = store.writes().filter((c) => c.op === 'replace' && c.poll.id === 'L');
  assert.deepEqual(rewritten, [], 'Expected no replace of the live poll (its counts could be mid-increment)');
});

test('P-9 reorder: a bad permutation or malformed body is a 400 and nothing changes', async () => {
  for (const body of [
    { orderedIds: ['A', 'B'] },
    { orderedIds: ['A', 'A', 'B', 'C'] },
    { orderedIds: ['A', 'B', 'C', 'ZZ'] },
    { orderedIds: 'A,B,C' },
    {},
    null,
  ]) {
    const { service, store } = setup(upcoming());
    const res = await service.reorder(body);
    assert.equal(res.status, 400, `Expected 400 for ${JSON.stringify(body)}`);
    assert.deepEqual(store.writes(), [], `Expected no write for ${JSON.stringify(body)}`);
  }
});

// ---------------------------------------------------------------- time passes (P-10)

test('P-10 an upcoming poll becomes locked once its Monday arrives', async () => {
  const { service, store, clock } = setup(queue(poll('A', '2026-10-26')));
  assert.equal(
    (await service.update('A', input('Edit while upcoming?'))).status,
    200,
    'Expected editing to work before the Monday'
  );
  clock.now = at('2026-10-26T09:00:00Z');
  assert.equal(
    (await service.update('A', input('Edit when live?'))).status,
    409,
    'Expected editing to be refused once live'
  );
  assert.equal((await service.remove('A')).status, 409, 'Expected deleting to be refused once live');
  assert.equal(store.docs.get('A')?.liveFrom, '2026-10-26', 'Expected liveFrom never to change');
});
