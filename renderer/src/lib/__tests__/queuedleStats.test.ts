import { describe, it, expect } from 'vitest';
import { buildHeatmap, buildRatingSeries, buildRoundAverages, buildWeeklyTotals, listPlayers } from '../queuedleStats';
import type { QueuedleDay } from '../queuedleStats';

const score = (userName: string, mainScore: number, bonusScore: number) => ({
  userName,
  mainScore,
  bonusScore,
  total: mainScore + bonusScore,
});

// Ten questions a day, so 20 points available.
const days: QueuedleDay[] = [
  { gameId: '2026-10-20', questionCount: 10, scores: [score('alice', 6, 4), score('bob', 8, 8)] },
  { gameId: '2026-10-19', questionCount: 10, scores: [score('alice', 10, 10)] },
  { gameId: '2026-10-26', questionCount: 10, scores: [score('bob', 5, 5), score(' carol ', 2, 0)] },
];

describe('queuedle stats', () => {
  it('lists players by games played, then name', () => {
    expect(listPlayers(days)).toEqual(['alice', 'bob', 'carol']);
  });

  it('builds a running average per player, in date order, null before their first game', () => {
    const { dates, series } = buildRatingSeries(days);
    expect(dates).toEqual(['2026-10-19', '2026-10-20', '2026-10-26']);
    const alice = series.find((s) => s.userName === 'alice')!;
    expect(alice.values).toEqual([100, 75, 75]); // 20/20, then 30/40, then no game
    expect(alice.played).toEqual([true, true, false]);
    const bob = series.find((s) => s.userName === 'bob')!;
    expect(bob.values).toEqual([null, 80, 65]); // 16/20, then 26/40
  });

  it('builds heatmap cells as a % of the day, empty when not played', () => {
    const { rows } = buildHeatmap(days);
    const carol = rows.find((r) => r.userName === 'carol')!;
    expect(carol.cells).toEqual([null, null, 10]);
    expect(carol.totals).toEqual([null, null, 2]);
  });

  it('averages each round separately', () => {
    const bob = buildRoundAverages(days).find((p) => p.userName === 'bob')!;
    expect(bob).toEqual({ userName: 'bob', games: 2, mainPct: 65, bonusPct: 65 });
    const alice = buildRoundAverages(days).find((p) => p.userName === 'alice')!;
    expect(alice.mainPct).toBe(80);
    expect(alice.bonusPct).toBe(70);
  });

  it('groups weeks newest first and sums within each', () => {
    const weeks = buildWeeklyTotals(days);
    expect(weeks.map((w) => w.range.from)).toEqual(['2026-10-26', '2026-10-19']);
    expect(weeks[1].standings.map((s) => [s.userName, s.total])).toEqual([
      ['alice', 30],
      ['bob', 16],
    ]);
  });

  it('skips days without questions and malformed rows', () => {
    const noisy: QueuedleDay[] = [
      { gameId: '2026-10-21', questionCount: 0, scores: [score('dave', 1, 1)] },
      { gameId: '2026-10-22', questionCount: 10, scores: [{ userName: '', mainScore: 1, bonusScore: 1, total: 2 }] },
    ];
    expect(listPlayers(noisy)).toEqual([]);
  });
});
