/**
 * "Today" for the DJ is the Europe/London calendar day, resetting at local
 * midnight. Never use UTC or the server's local zone: the Functions host runs in
 * UTC, and for half the year London midnight is 23:00 UTC.
 */

const londonClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function londonParts(ms: number): Record<string, string> {
  const parts: Record<string, string> = {};
  for (const p of londonClock.formatToParts(new Date(ms))) parts[p.type] = p.value;
  return parts;
}

/** 'YYYY-MM-DD' of the Europe/London calendar day containing `nowMs`. */
export function londonDayKey(nowMs: number): string {
  const p = londonParts(nowMs);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Epoch ms of 00:00 Europe/London on the calendar day containing `nowMs`. */
export function londonDayStartMs(nowMs: number): number {
  const p = londonParts(nowMs);
  const key = `${p.year}-${p.month}-${p.day}`;
  const sinceMidnight =
    ((Number(p.hour) * 60 + Number(p.minute)) * 60 + Number(p.second)) * 1000 +
    (((nowMs % 1000) + 1000) % 1000);

  // Subtracting the wall-clock time is exact except on the two days a year the
  // clocks change, where the day is 23 or 25 hours long. Try the hour either
  // side and keep the instant that is the first of its London day.
  const guess = nowMs - sinceMidnight;
  for (const shift of [0, -3_600_000, 3_600_000]) {
    const t = guess + shift;
    if (londonDayKey(t) === key && londonDayKey(t - 1) !== key) return t;
  }
  throw new Error(`londonDayStartMs: could not resolve the start of ${key}`);
}
