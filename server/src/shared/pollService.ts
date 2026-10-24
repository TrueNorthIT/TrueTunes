/**
 * Weekly anonymous poll — HTTP-level logic, independent of Azure Functions and Cosmos.
 *
 * Pinned by pollService.test.ts
 * (P-2, P-3, P-5, P-6, P-7, P-9, P-10). The Azure wiring (functions/polls.ts) is a thin
 * layer that parses the request, calls one method here and returns `{status, body}` as JSON.
 *
 * Suggested routes (authLevel anonymous, honour system, no auth on admin routes):
 *   GET    /api/polls                -> listLive
 *   POST   /api/polls/answer         -> answer          body {pollId, choice}
 *   GET    /api/polls-admin          -> adminList
 *   POST   /api/polls-admin          -> create          body {question, choices}
 *   PUT    /api/polls-admin/{id}     -> update          body {question, choices}
 *   DELETE /api/polls-admin/{id}     -> remove
 *   POST   /api/polls-admin/reorder  -> reorder         body {orderedIds}
 */
import { randomUUID } from 'node:crypto';
import { PollError, assignSchedule, isLive, reorder as reorderPolls, validatePollInput, visiblePolls } from './polls';
import type { Poll } from './polls';

/**
 * The slice of the `polls` container the service needs. Production: pollCosmosStore.ts.
 * Tests: MemoryPollStore (pollsKit.testkit.ts), which records every call.
 */
export interface PollStore {
  /** Every poll, any order. */
  list(): Promise<Poll[]>;
  /** Resolves undefined when the poll does not exist. */
  read(id: string): Promise<Poll | undefined>;
  create(poll: Poll): Promise<Poll>;
  /** Full replacement of an existing poll. Never used to record an answer. */
  replace(poll: Poll): Promise<Poll>;
  remove(id: string): Promise<void>;
  /**
   * Atomically add 1 to counts[index] (Cosmos patch `{op:'incr', path:'/counts/<index>', value:1}`).
   * This is the ONLY way an answer is recorded.
   */
  incrementCount(id: string, index: number): Promise<void>;
}

export interface HttpResult<T = unknown> {
  status: number;
  body: T;
}

/** What a client sees: never `counts`, never `order`. */
export interface LivePoll {
  id: string;
  question: string;
  choices: string[];
  liveFrom: string;
}

/** What the admin sees: also never `counts` (there is no results UI). */
export interface AdminPoll {
  id: string;
  question: string;
  choices: string[];
  /** null only for an unscheduled poll (should not occur through the API). */
  liveFrom: string | null;
  /** isLive(poll, now): locked when true. */
  live: boolean;
}

export interface PollServiceDeps {
  store: PollStore;
  now: () => number;
  /** Defaults to crypto.randomUUID. Tests inject a counter. */
  newId?: () => string;
  /** Defaults to a no-op. Nothing logged may contain the chosen answer (P-3). */
  log?: (message: string, ...args: unknown[]) => void;
}

export interface PollService {
  /** 200 `{polls: LivePoll[]}`: visiblePolls(all, now, empty set), oldest first. */
  listLive(): Promise<HttpResult<{ polls: LivePoll[] }>>;
  /**
   * `body` is untrusted JSON; only `pollId` (string) and `choice` (integer) are read, any other
   * property is ignored and never stored or logged.
   * 200 `{ok:true}` after incrementCount(pollId, choice); 400 malformed body or choice not an
   * integer within 0..choices.length-1; 404 unknown poll or poll not live yet. On 400/404 the
   * store is not written to.
   */
  answer(body: unknown): Promise<HttpResult<{ ok: true } | { error: string }>>;
  /** 200 `{polls: AdminPoll[]}` in schedule order (by `order`). */
  adminList(): Promise<HttpResult<{ polls: AdminPoll[] }>>;
  /**
   * 201 `{poll: AdminPoll}`: appended to the end of the queue, counts all zero, liveFrom from
   * assignSchedule. 400 `{error, errors}` when validatePollInput fails (nothing stored).
   */
  create(body: unknown): Promise<HttpResult<{ poll: AdminPoll } | { error: string; errors?: string[] }>>;
  /** 200 `{poll}` replacing question/choices only (liveFrom, order unchanged; counts zeroed to the new length). 400 invalid, 404 unknown, 409 live. */
  update(id: string, body: unknown): Promise<HttpResult<{ poll: AdminPoll } | { error: string; errors?: string[] }>>;
  /** 200 `{ok:true}` and the remaining upcoming polls are re-scheduled to close the gap (assignSchedule). 404 unknown, 409 live. */
  remove(id: string): Promise<HttpResult<{ ok: true } | { error: string }>>;
  /** body `{orderedIds: string[]}`; see polls.reorder. 200 `{polls: AdminPoll[]}` (full queue), 400 bad permutation or body, 409 a live id. */
  reorder(body: unknown): Promise<HttpResult<{ polls: AdminPoll[] } | { error: string }>>;
}

function toAdmin(poll: Poll, nowMs: number): AdminPoll {
  return {
    id: poll.id,
    question: poll.question,
    choices: poll.choices,
    liveFrom: poll.liveFrom,
    live: isLive(poll, nowMs),
  };
}

const byOrder = (a: Poll, b: Poll): number => a.order - b.order;

const NO_ANSWERS: ReadonlySet<string> = new Set();

function isNotFound(err: unknown): boolean {
  const e = err as { statusCode?: number; code?: number } | null;
  return e?.statusCode === 404 || e?.code === 404;
}

export function createPollService(deps: PollServiceDeps): PollService {
  const { store, now } = deps;
  const newId = deps.newId ?? randomUUID;

  async function queue(): Promise<Poll[]> {
    return (await store.list()).sort(byOrder);
  }

  /** Writes only the upcoming polls that differ from `before`; live polls are never rewritten. */
  async function persistChanges(before: readonly Poll[], after: readonly Poll[]): Promise<void> {
    const old = new Map(before.map((p) => [p.id, JSON.stringify(p)]));
    const t = now();
    for (const p of after) {
      if (!isLive(p, t) && old.get(p.id) !== JSON.stringify(p)) await store.replace(p);
    }
  }

  return {
    async listLive() {
      const polls = visiblePolls(await store.list(), now(), NO_ANSWERS).map(({ id, question, choices, liveFrom }) => ({
        id,
        question,
        choices,
        liveFrom: liveFrom as string,
      }));
      return { status: 200, body: { polls } };
    },

    async answer(body) {
      if (typeof body !== 'object' || body === null || Array.isArray(body))
        return { status: 400, body: { error: 'Invalid body' } };
      const { pollId, choice } = body as { pollId?: unknown; choice?: unknown };
      if (typeof pollId !== 'string' || !pollId) return { status: 400, body: { error: 'pollId is required' } };
      if (typeof choice !== 'number' || !Number.isInteger(choice))
        return { status: 400, body: { error: 'choice must be an integer' } };

      const poll = await store.read(pollId);
      if (!poll || !isLive(poll, now())) return { status: 404, body: { error: 'Poll not found' } };
      if (choice < 0 || choice >= poll.choices.length) return { status: 400, body: { error: 'choice out of range' } };

      try {
        await store.incrementCount(pollId, choice);
      } catch (err) {
        if (isNotFound(err)) return { status: 404, body: { error: 'Poll not found' } };
        throw err;
      }
      return { status: 200, body: { ok: true } };
    },

    async adminList() {
      const t = now();
      return { status: 200, body: { polls: (await queue()).map((p) => toAdmin(p, t)) } };
    },

    async create(body) {
      const input = validatePollInput(body);
      if (!input.ok) return { status: 400, body: { error: 'Invalid poll', errors: input.errors } };
      const existing = await queue();
      const draft: Poll = {
        id: newId(),
        question: input.value.question,
        choices: input.value.choices,
        counts: input.value.choices.map(() => 0),
        order: existing.length,
        liveFrom: null,
      };
      const scheduled = assignSchedule([...existing, draft], now()).at(-1) as Poll;
      const created = await store.create(scheduled);
      return { status: 201, body: { poll: toAdmin(created, now()) } };
    },

    async update(id, body) {
      const poll = await store.read(id);
      if (!poll) return { status: 404, body: { error: 'Poll not found' } };
      if (isLive(poll, now())) return { status: 409, body: { error: 'A live poll cannot be edited' } };
      const input = validatePollInput(body);
      if (!input.ok) return { status: 400, body: { error: 'Invalid poll', errors: input.errors } };
      const updated = await store.replace({
        ...poll,
        question: input.value.question,
        choices: input.value.choices,
        counts: input.value.choices.map(() => 0),
      });
      return { status: 200, body: { poll: toAdmin(updated, now()) } };
    },

    async remove(id) {
      const poll = await store.read(id);
      if (!poll) return { status: 404, body: { error: 'Poll not found' } };
      if (isLive(poll, now())) return { status: 409, body: { error: 'A live poll cannot be deleted' } };
      await store.remove(id);
      const before = (await queue()).filter((p) => p.id !== id);
      const after = assignSchedule(before, now()).map((p, i) => ({ ...p, order: i }));
      await persistChanges(before, after);
      return { status: 200, body: { ok: true } };
    },

    async reorder(body) {
      const ids = (body as { orderedIds?: unknown } | null)?.orderedIds;
      if (!Array.isArray(ids) || !ids.every((i) => typeof i === 'string')) {
        return { status: 400, body: { error: 'orderedIds must be an array of poll ids' } };
      }
      const before = await queue();
      let after: Poll[];
      try {
        after = reorderPolls(before, ids as string[], now());
      } catch (err) {
        if (err instanceof PollError) return { status: err.status, body: { error: err.message } };
        throw err;
      }
      await persistChanges(before, after);
      const t = now();
      return { status: 200, body: { polls: after.map((p) => toAdmin(p, t)) } };
    },
  };
}
