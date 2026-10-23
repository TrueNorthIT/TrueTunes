// Shapes the whole Queuedle history (every ready day's leaderboard) into the
// series the stats page draws. Pure, so each chart's numbers are testable.
import { calculateWeeklyLeaderboard, weekRangeOf } from './queuedleWeek';
import type { WeekRange, WeeklyStanding } from './queuedleWeek';

export interface QueuedleDayScore {
  userName: string;
  mainScore: number;
  bonusScore: number;
  total: number;
}

export interface QueuedleDay {
  gameId: string;
  questionCount: number;
  scores: QueuedleDayScore[];
}

export interface RatingSeries {
  userName: string;
  /** Running average % of the maximum, per date; null before their first game. */
  values: (number | null)[];
  /** Whether they played on each date. */
  played: boolean[];
}

export interface HeatmapRow {
  userName: string;
  /** That day's total as a % of the day's maximum; null when they didn't play. */
  cells: (number | null)[];
  totals: (number | null)[];
}

export interface RoundAverages {
  userName: string;
  games: number;
  mainPct: number;
  bonusPct: number;
}

export interface WeekTotals {
  range: WeekRange;
  standings: WeeklyStanding[];
}

function cleanDays(days: QueuedleDay[]): QueuedleDay[] {
  return days
    .filter((d) => d.questionCount > 0)
    .map((d) => ({
      ...d,
      scores: d.scores
        .filter((s) => typeof s.userName === 'string' && s.userName.trim() && Number.isFinite(s.total))
        .map((s) => ({ ...s, userName: s.userName.trim() })),
    }))
    .sort((a, b) => a.gameId.localeCompare(b.gameId));
}

/** Players ordered by games played, then name. */
export function listPlayers(days: QueuedleDay[]): string[] {
  const games = new Map<string, number>();
  for (const d of cleanDays(days)) for (const s of d.scores) games.set(s.userName, (games.get(s.userName) ?? 0) + 1);
  return [...games.keys()].sort((a, b) => games.get(b)! - games.get(a)! || a.localeCompare(b));
}

export function buildRatingSeries(days: QueuedleDay[]): { dates: string[]; series: RatingSeries[] } {
  const sorted = cleanDays(days);
  const dates = sorted.map((d) => d.gameId);
  const series = listPlayers(sorted).map((userName) => {
    let scored = 0;
    let possible = 0;
    const values: (number | null)[] = [];
    const played: boolean[] = [];
    for (const day of sorted) {
      const s = day.scores.find((x) => x.userName === userName);
      if (s) {
        scored += s.total;
        possible += day.questionCount * 2;
      }
      played.push(!!s);
      values.push(possible > 0 ? (scored / possible) * 100 : null);
    }
    return { userName, values, played };
  });
  return { dates, series };
}

export function buildHeatmap(days: QueuedleDay[]): { dates: string[]; rows: HeatmapRow[] } {
  const sorted = cleanDays(days);
  const dates = sorted.map((d) => d.gameId);
  const rows = listPlayers(sorted).map((userName) => {
    const totals = sorted.map((d) => d.scores.find((x) => x.userName === userName)?.total ?? null);
    const cells = totals.map((t, i) => (t === null ? null : (t / (sorted[i].questionCount * 2)) * 100));
    return { userName, cells, totals };
  });
  return { dates, rows };
}

export function buildRoundAverages(days: QueuedleDay[]): RoundAverages[] {
  const acc = new Map<string, { games: number; main: number; bonus: number; possible: number }>();
  for (const d of cleanDays(days)) {
    for (const s of d.scores) {
      const a = acc.get(s.userName) ?? { games: 0, main: 0, bonus: 0, possible: 0 };
      a.games += 1;
      a.main += s.mainScore;
      a.bonus += s.bonusScore;
      a.possible += d.questionCount;
      acc.set(s.userName, a);
    }
  }
  return [...acc.entries()]
    .map(([userName, a]) => ({
      userName,
      games: a.games,
      mainPct: (a.main / a.possible) * 100,
      bonusPct: (a.bonus / a.possible) * 100,
    }))
    .sort((a, b) => b.games - a.games || a.userName.localeCompare(b.userName));
}

/** Every week with at least one game, newest first. */
export function buildWeeklyTotals(days: QueuedleDay[]): WeekTotals[] {
  const byWeek = new Map<string, { range: WeekRange; boards: QueuedleDay[] }>();
  for (const d of cleanDays(days)) {
    const range = weekRangeOf(d.gameId);
    if (!range) continue;
    const w = byWeek.get(range.from) ?? { range, boards: [] };
    w.boards.push(d);
    byWeek.set(range.from, w);
  }
  return [...byWeek.values()]
    .sort((a, b) => b.range.from.localeCompare(a.range.from))
    .map((w) => ({ range: w.range, standings: calculateWeeklyLeaderboard(w.boards) }));
}
