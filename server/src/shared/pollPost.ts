/**
 * The daily Vestaboard poll post (P-13).
 *
 * Pinned by pollPost.test.ts.
 * Production wiring (functions/polls.ts, a timer firing at 10:23 and 11:23 UTC on weekdays):
 * `post` is vestaboard.ts's postBoard, which already no-ops when VESTABOARD_API_KEY is unset.
 */
import type { PollStore } from './pollService';
import { renderPollBoard, renderPollFallbackBoard } from './pollBoard';
import { shouldPostPoll } from './polls';

export interface PollPostDeps {
  store: PollStore;
  now: () => number;
  /** Receives the 6x22 board from renderPollBoard. */
  post: (board: number[][]) => Promise<void>;
  log?: (message: string, ...args: unknown[]) => void;
}

/**
 * Posts this week's poll when polls.shouldPostPoll says so (weekday, 11:23 London, a poll's
 * liveFrom is this week's Monday), using renderPollBoard(poll.question).board. A question that
 * does not fit the board is announced generically rather than truncated. Resolves
 * `{posted: true, pollId}` after `post` resolves, otherwise `{posted: false}` without calling
 * `post`. Rejects if `post` rejects.
 */
export async function runPollPost(deps: PollPostDeps): Promise<{ posted: boolean; pollId?: string }> {
  const { store, now, post, log = () => {} } = deps;
  const poll = shouldPostPoll(await store.list(), now());
  if (!poll) return { posted: false };

  const { board, fits } = renderPollBoard(poll.question);
  if (!fits) log('[polls] question does not fit the Vestaboard; posting the generic announcement');
  await post(fits ? board : renderPollFallbackBoard());
  return { posted: true, pollId: poll.id };
}
