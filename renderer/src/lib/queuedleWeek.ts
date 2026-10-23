// Weekly Queuedle leaderboard: every game played Monday to Sunday, summed.
// Game ids are London calendar dates (YYYY-MM-DD), so the week is worked out
// from the string itself and never from the machine's own time zone.

export interface WeekRange {
  from: string; // Monday
  to: string; // Sunday
}

export interface WeeklyStanding {
  userName: string;
  gamesPlayed: number;
  total: number;
  bestTotal: number;
}

const DAY_MS = 24 * 60 * 60_000;

function toId(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function weekRangeOf(gameId: string): WeekRange | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(gameId);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(ms)) return null;
  const sinceMonday = (new Date(ms).getUTCDay() + 6) % 7;
  const monday = ms - sinceMonday * DAY_MS;
  return { from: toId(monday), to: toId(monday + 6 * DAY_MS) };
}

export function isInWeek(gameId: string, range: WeekRange): boolean {
  return gameId >= range.from && gameId <= range.to;
}

/** "13–19 Oct", or "29 Sep – 5 Oct" when the week spans two months. */
export function formatWeekRange(range: WeekRange): string {
  const fmt = (id: string, withMonth: boolean) => {
    const d = new Date(`${id}T00:00:00Z`);
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      ...(withMonth ? { month: 'short' } : {}),
      timeZone: 'UTC',
    });
  };
  const sameMonth = range.from.slice(0, 7) === range.to.slice(0, 7);
  return sameMonth ? `${fmt(range.from, false)}–${fmt(range.to, true)}` : `${fmt(range.from, true)} – ${fmt(range.to, true)}`;
}

/**
 * Sums each player's totals across the week's daily leaderboards. Playing more
 * days counts, so ties on points go to whoever played fewer games, then to the
 * better single day, then alphabetically.
 */
export function calculateWeeklyLeaderboard(leaderboards: unknown[]): WeeklyStanding[] {
  const byUser = new Map<string, WeeklyStanding>();
  for (const board of leaderboards) {
    const scores = board && typeof board === 'object' ? (board as Partial<GameLeaderboardResult>).scores : undefined;
    if (!Array.isArray(scores)) continue;
    for (const s of scores) {
      if (!s || typeof s.userName !== 'string' || typeof s.total !== 'number') continue;
      const userName = s.userName.trim();
      if (!userName) continue;
      const row = byUser.get(userName) ?? { userName, gamesPlayed: 0, total: 0, bestTotal: 0 };
      row.gamesPlayed += 1;
      row.total += s.total;
      row.bestTotal = Math.max(row.bestTotal, s.total);
      byUser.set(userName, row);
    }
  }
  return [...byUser.values()].sort(
    (a, b) =>
      b.total - a.total ||
      a.gamesPlayed - b.gamesPlayed ||
      b.bestTotal - a.bestTotal ||
      a.userName.localeCompare(b.userName)
  );
}
