// The frozen "now" of every mock page story (set in mockRuntime.ts). Monday 26 October 2026, midday UTC.
export const FROZEN_NOW = Date.parse('2026-10-26T12:00:00Z');
export const TODAY_ID = '2026-10-26';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** A timestamp `n` units before the frozen now. */
export const minutesAgo = (n: number) => FROZEN_NOW - n * MIN;
export const hoursAgo = (n: number) => FROZEN_NOW - n * HOUR;
export const daysAgo = (n: number) => FROZEN_NOW - n * DAY;

/** Game id (a London date) `n` days before today. */
export const gameIdDaysAgo = (n: number) => new Date(FROZEN_NOW - n * DAY).toISOString().slice(0, 10);
