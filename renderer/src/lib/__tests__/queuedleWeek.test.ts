import { describe, it, expect } from 'vitest';
import { calculateWeeklyLeaderboard, formatWeekRange, isInWeek, weekRangeOf } from '../queuedleWeek';

const board = (gameId: string, scores: Array<[string, number]>) => ({
  gameId,
  scores: scores.map(([userName, total]) => ({ userName, total, mainScore: 0, bonusScore: 0 })),
});

describe('weekRangeOf', () => {
  it('runs Monday to Sunday', () => {
    expect(weekRangeOf('2026-10-23')).toEqual({ from: '2026-10-19', to: '2026-10-25' }); // Friday
    expect(weekRangeOf('2026-10-19')).toEqual({ from: '2026-10-19', to: '2026-10-25' }); // Monday
    expect(weekRangeOf('2026-10-25')).toEqual({ from: '2026-10-19', to: '2026-10-25' }); // Sunday
  });

  it('crosses month and year ends', () => {
    expect(weekRangeOf('2026-11-01')).toEqual({ from: '2026-10-26', to: '2026-11-01' });
    expect(weekRangeOf('2027-01-01')).toEqual({ from: '2026-12-28', to: '2027-01-03' });
  });

  it('is unaffected by the clocks changing', () => {
    // BST ends on Sunday 25 October 2026.
    expect(weekRangeOf('2026-10-26')).toEqual({ from: '2026-10-26', to: '2026-11-01' });
  });

  it('rejects anything that is not a game date', () => {
    expect(weekRangeOf('today')).toBeNull();
  });
});

describe('isInWeek / formatWeekRange', () => {
  const week = { from: '2026-10-19', to: '2026-10-25' };
  it('includes both ends and nothing outside', () => {
    expect(isInWeek('2026-10-19', week)).toBe(true);
    expect(isInWeek('2026-10-25', week)).toBe(true);
    expect(isInWeek('2026-10-18', week)).toBe(false);
    expect(isInWeek('2026-10-26', week)).toBe(false);
  });

  it('formats the week', () => {
    expect(formatWeekRange(week)).toBe('19–25 Oct');
    expect(formatWeekRange({ from: '2026-09-28', to: '2026-10-04' })).toBe('28 Sept – 4 Oct');
  });
});

describe('calculateWeeklyLeaderboard', () => {
  it('sums each player across the week', () => {
    const rows = calculateWeeklyLeaderboard([
      board('2026-10-19', [['alice', 12], ['bob', 15]]),
      board('2026-10-20', [['alice', 10], ['carol', 18]]),
    ]);
    expect(rows.map((r) => [r.userName, r.total, r.gamesPlayed, r.bestTotal])).toEqual([
      ['alice', 22, 2, 12],
      ['carol', 18, 1, 18],
      ['bob', 15, 1, 15],
    ]);
  });

  it('breaks a tie on points in favour of fewer games, then the better day', () => {
    const rows = calculateWeeklyLeaderboard([
      board('2026-10-19', [['alice', 10], ['bob', 20], ['carol', 12]]),
      board('2026-10-20', [['alice', 10], ['carol', 8], ['dave', 20]]),
    ]);
    expect(rows.map((r) => r.userName)).toEqual(['bob', 'dave', 'carol', 'alice']);
  });

  it('ignores failed fetches and malformed rows', () => {
    const rows = calculateWeeklyLeaderboard([
      null,
      { error: 'boom' },
      { scores: [{ userName: '  ', total: 5 }, { userName: 'alice' }, { userName: ' alice ', total: 7 }] },
    ]);
    expect(rows).toEqual([{ userName: 'alice', gamesPlayed: 1, total: 7, bestTotal: 7 }]);
  });
});
