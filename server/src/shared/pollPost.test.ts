// Run: npm test (from server/).
//
// P-13 "A timer function posts this week's poll to the Vestaboard once per weekday at 11:23
// Europe/London, only if a poll's liveFrom equals this week's Monday. No-op when
// VESTABOARD_API_KEY unset (existing behaviour)."
//
// Code under test: runPollPost in server/src/shared/pollPost.ts (new module, currently a stub).
// The timer function wires it with vestaboard.ts's postBoard (which already no-ops without the
// API key) and fires at 10:23 and 11:23 UTC on weekdays; the London 11:23 decision itself is
// pinned in polls.test.ts (shouldPostPoll).
import test from 'node:test';
import assert from 'node:assert/strict';
import { runPollPost } from './pollPost';
import { renderPollBoard } from './pollBoard';
import { MemoryPollStore, poll, queue } from './pollsKit.testkit';

const at = (iso: string): number => Date.parse(iso);

function setup(now: string, polls = queue(poll('this', '2026-10-26', { question: 'Best biscuit?' }), poll('next', '2026-11-02'))) {
  const posted: number[][][] = [];
  const store = new MemoryPollStore(polls);
  const deps = {
    store,
    now: () => at(now),
    post: async (board: number[][]) => {
      posted.push(board);
    },
    log: () => {},
  };
  return { deps, posted, store };
}

test("P-13 runPollPost: at 11:23 London on a weekday it posts this week's poll board once", async () => {
  const { deps, posted } = setup('2026-10-28T11:23:00Z');
  const result = await runPollPost(deps);
  assert.deepEqual(result, { posted: true, pollId: 'this' }, "Expected this week's poll (liveFrom 2026-10-26) to be reported as posted");
  assert.equal(posted.length, 1, 'Expected exactly one Vestaboard post');
  assert.deepEqual(posted[0], renderPollBoard('Best biscuit?').board, 'Expected the posted board to be the rendered poll board');
});

test('P-13 runPollPost: outside the 11:23 window it does not post', async () => {
  const { deps, posted } = setup('2026-10-28T09:00:00Z');
  const result = await runPollPost(deps);
  assert.deepEqual(result, { posted: false }, 'Expected no post at 09:00');
  assert.equal(posted.length, 0, 'Expected post() not to be called');
});

test('P-13 runPollPost: when no poll has liveFrom equal to this Monday it does not post', async () => {
  const { deps, posted } = setup('2026-10-28T11:23:00Z', queue(poll('old', '2026-10-19'), poll('later', '2026-11-02')));
  const result = await runPollPost(deps);
  assert.deepEqual(result, { posted: false }, 'Expected nothing to post');
  assert.equal(posted.length, 0, 'Expected post() not to be called');
});

test('P-13 runPollPost: at the weekend it does not post', async () => {
  const { deps, posted } = setup('2026-10-31T11:23:00Z');
  assert.deepEqual(await runPollPost(deps), { posted: false }, 'Expected no post on Saturday');
  assert.equal(posted.length, 0, 'Expected post() not to be called');
});

test('P-13 runPollPost: during BST the 10:23 UTC firing posts and the 11:23 UTC firing does not', async () => {
  const polls = queue(poll('summer', '2026-07-13', { question: 'Summer?' }));
  const first = setup('2026-07-15T10:23:00Z', polls);
  const second = setup('2026-07-15T11:23:00Z', polls);
  assert.equal((await runPollPost(first.deps)).posted, true, 'Expected the 10:23Z firing (11:23 BST) to post');
  assert.equal((await runPollPost(second.deps)).posted, false, 'Expected the 11:23Z firing (12:23 BST) not to post');
});

test('P-13 runPollPost: never writes to the store (posting is read-only)', async () => {
  const { deps, store } = setup('2026-10-28T11:23:00Z');
  await runPollPost(deps);
  assert.deepEqual(store.writes(), [], 'Expected no store writes while posting');
});

test('P-13 runPollPost: a failing post rejects so the failure is visible to the timer', async () => {
  const { deps } = setup('2026-10-28T11:23:00Z');
  deps.post = async () => {
    throw new Error('Vestaboard API 500');
  };
  await assert.rejects(() => runPollPost(deps), /Vestaboard API 500/, 'Expected the post error to propagate');
});
