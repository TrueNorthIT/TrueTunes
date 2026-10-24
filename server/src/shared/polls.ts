/**
 * Weekly anonymous poll — pure scheduling and validation logic.
 *
 * Pinned by polls.test.ts (requirement IDs P-5, P-6, P-7, P-9, P-10, P-13).
 *
 * Dates are `YYYY-MM-DD` strings in Europe/London. "Today", "this week's Monday"
 * and "the current year" are all London-local, DST-correct (BST/GMT), NOT UTC:
 * at 2026-10-18T23:30:00Z (00:30 BST on Monday 19 Oct) London's Monday is 2026-10-19.
 *
 * Every function is pure: no clock, no I/O, no mutation of its arguments.
 */

/** A poll as stored in the `polls` Cosmos container (partition key /id). */
export interface Poll {
  id: string;
  question: string;
  /** 2 to 6 non-empty strings. */
  choices: string[];
  /** counts[i] = number of answers for choices[i]. Same length as `choices`. */
  counts: number[];
  /** Position in the schedule queue; the service keeps it equal to the array index. */
  order: number;
  /** A London Monday (YYYY-MM-DD), or null while not yet scheduled. */
  liveFrom: string | null;
}

/** Thrown by the pure scheduling functions; `status` is the HTTP status the handler should return. */
export class PollError extends Error {
  constructor(
    public readonly status: 400 | 404 | 409,
    message: string
  ) {
    super(message);
    this.name = 'PollError';
  }
}

const DAY_MS = 86_400_000;

interface LondonClock {
  date: string;
  /** 0 = Monday .. 6 = Sunday. */
  weekday: number;
  minutes: number;
}

function dateToUtc(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** 0 = Monday .. 6 = Sunday. */
function weekdayOf(date: string): number {
  return (new Date(dateToUtc(date)).getUTCDay() + 6) % 7;
}

function addDays(date: string, days: number): string {
  return new Date(dateToUtc(date) + days * DAY_MS).toISOString().slice(0, 10);
}

function mondayOf(date: string): string {
  return addDays(date, -weekdayOf(date));
}

function londonClock(nowMs: number): LondonClock {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(nowMs));
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '0';
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  return { date, weekday: weekdayOf(date), minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

/** London calendar date (YYYY-MM-DD) containing `nowMs`. */
export function londonToday(nowMs: number): string {
  return londonClock(nowMs).date;
}

/** The Monday (YYYY-MM-DD, London) of the London calendar week containing `nowMs`. Sunday belongs to the week that began the previous Monday. */
export function londonMonday(nowMs: number): string {
  return mondayOf(londonToday(nowMs));
}

/** True when `poll.liveFrom` is set and `liveFrom <= londonToday(nowMs)`. Unscheduled (null) polls are never live. */
export function isLive(poll: { liveFrom: string | null }, nowMs: number): boolean {
  return poll.liveFrom !== null && poll.liveFrom <= londonToday(nowMs);
}

/**
 * `orderedPolls` is the schedule queue in order. Returns a NEW array, same order and
 * length, same poll objects except `liveFrom`:
 *  - live polls (isLive) keep their `liveFrom` untouched;
 *  - every other poll (upcoming or null) is assigned consecutive Mondays in queue order,
 *    starting from the first Monday STRICTLY AFTER both the current London week's Monday
 *    and the latest live poll's week.
 * Example: created Thursday 2026-10-22, nothing live this week: A 2026-10-26, B 2026-11-02, C 2026-11-09.
 */
export function assignSchedule<T extends { id: string; liveFrom: string | null }>(
  orderedPolls: readonly T[],
  nowMs: number
): T[] {
  let latest = londonMonday(nowMs);
  for (const p of orderedPolls) {
    if (p.liveFrom !== null && isLive(p, nowMs)) {
      const week = mondayOf(p.liveFrom);
      if (week > latest) latest = week;
    }
  }
  let next = addDays(latest, 7);
  return orderedPolls.map((p) => {
    if (isLive(p, nowMs)) return p;
    const liveFrom = next;
    next = addDays(next, 7);
    return { ...p, liveFrom };
  });
}

/**
 * What a client should be offered: polls that are live, whose `liveFrom` falls in the
 * current London calendar year, and whose id is not in `answeredIds`; oldest `liveFrom`
 * first (ties keep input order). Returns a new array.
 */
export function visiblePolls<T extends { id: string; liveFrom: string | null }>(
  polls: readonly T[],
  nowMs: number,
  answeredIds: ReadonlySet<string>
): T[] {
  const year = londonToday(nowMs).slice(0, 4);
  return polls
    .filter((p) => p.liveFrom !== null && isLive(p, nowMs) && p.liveFrom.slice(0, 4) === year && !answeredIds.has(p.id))
    .sort((a, b) => (a.liveFrom as string).localeCompare(b.liveFrom as string));
}

/** The poll whose `liveFrom === londonMonday(nowMs)`, or undefined. */
export function pollForThisWeek<T extends { liveFrom: string | null }>(
  polls: readonly T[],
  nowMs: number
): T | undefined {
  const monday = londonMonday(nowMs);
  return polls.find((p) => p.liveFrom === monday);
}

/** First and last London minute of the day (11:23 to 11:37) in which the Vestaboard post may go out. */
const POST_FROM_MINUTE = 11 * 60 + 23;
const POST_TO_MINUTE = 11 * 60 + 37;

/**
 * Decision for the daily Vestaboard timer. Returns this week's poll when, and only when,
 * London local time is Monday to Friday between 11:23:00 and 11:37:59 inclusive (a 15 minute
 * grace for timer latency) AND `pollForThisWeek` finds one; otherwise undefined.
 *
 * The Azure timer CRON is UTC and the app has no WEBSITE_TIME_ZONE, so the timer must fire
 * at BOTH 10:23 and 11:23 UTC on weekdays (`0 23 10,11 * * 1-5`); exactly one of those two
 * instants is 11:23 London on any given day (BST: 10:23Z, GMT: 11:23Z). This gate does the rest.
 */
export function shouldPostPoll<T extends { liveFrom: string | null }>(
  polls: readonly T[],
  nowMs: number
): T | undefined {
  const { weekday, minutes } = londonClock(nowMs);
  if (weekday > 4 || minutes < POST_FROM_MINUTE || minutes > POST_TO_MINUTE) return undefined;
  return pollForThisWeek(polls, nowMs);
}

export type PollInputResult =
  | { ok: true; value: { question: string; choices: string[] } }
  | { ok: false; errors: string[] };

const MIN_CHOICES = 2;
const MAX_CHOICES = 6;

/**
 * Validates an admin create/edit payload (untrusted JSON).
 * Valid when: `question` is a string with non-whitespace content; `choices` is an array of
 * 2 to 6 strings, every one with non-whitespace content. Question and choices are trimmed
 * in `value`. Blank choices are REJECTED (not silently dropped). Anything else (non-object,
 * non-string members, 1 or 7 choices) is `{ ok: false, errors }` with at least one message.
 */
export function validatePollInput(input: unknown): PollInputResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errors: ['Body must be an object with a question and choices'] };
  }
  const { question, choices } = input as { question?: unknown; choices?: unknown };
  const errors: string[] = [];
  if (typeof question !== 'string' || !question.trim()) errors.push('A question is required');
  if (!Array.isArray(choices) || choices.length < MIN_CHOICES || choices.length > MAX_CHOICES) {
    errors.push(`Between ${MIN_CHOICES} and ${MAX_CHOICES} choices are required`);
  } else if (!choices.every((c) => typeof c === 'string' && c.trim())) {
    errors.push('Every choice must be non-empty text');
  }
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { question: (question as string).trim(), choices: (choices as string[]).map((c) => c.trim()) },
  };
}

/**
 * `orderedIds` must be a permutation of exactly the UPCOMING (non-live) poll ids.
 * Returns the full queue: live polls first, unchanged and in their existing relative
 * order, then the upcoming polls in `orderedIds` order with `liveFrom` re-assigned per
 * assignSchedule and `order` renumbered to the array index (live polls' `order` too).
 *  - any live id in `orderedIds` -> throws PollError(409)
 *  - unknown id, duplicate, or a missing upcoming id -> throws PollError(400)
 */
export function reorder(polls: readonly Poll[], orderedIds: readonly string[], nowMs: number): Poll[] {
  const live = polls.filter((p) => isLive(p, nowMs));
  const upcoming = polls.filter((p) => !isLive(p, nowMs));
  const liveIds = new Set(live.map((p) => p.id));
  if (orderedIds.some((id) => liveIds.has(id))) throw new PollError(409, 'Live polls cannot be reordered');

  const byId = new Map(upcoming.map((p) => [p.id, p]));
  const seen = new Set<string>();
  for (const id of orderedIds) {
    if (!byId.has(id)) throw new PollError(400, `Unknown poll id: ${id}`);
    if (seen.has(id)) throw new PollError(400, `Duplicate poll id: ${id}`);
    seen.add(id);
  }
  if (seen.size !== upcoming.length) throw new PollError(400, 'orderedIds must include every upcoming poll');

  const queue = [...live, ...orderedIds.map((id) => byId.get(id) as Poll)];
  return assignSchedule(queue, nowMs).map((p, i) => ({ ...p, order: i }));
}
