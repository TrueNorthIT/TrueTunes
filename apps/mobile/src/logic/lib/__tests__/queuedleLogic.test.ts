import { describe, expect, it } from 'vitest';
import {
  bonusTarget,
  carryFromSide,
  distribution,
  londonDateToday,
  pipStates,
  projectRanking,
  scoreBonus,
  scoreMain,
  winningItems,
} from '../queuedleLogic';

const item = (id: string, topQueuer = 'Al'): GameItem => ({
  category: 'track',
  id,
  name: id,
  subtitle: '',
  count: 1,
  topQueuer,
  queuerCandidates: ['Al', 'Bo'],
});
const q = (l: string, r: string, winner: 'left' | 'right', extra: Partial<GameQuestion> = {}): GameQuestion => ({
  index: 0,
  left: item(l, 'Al'),
  right: item(r, 'Bo'),
  winner,
  ...extra,
});

describe('queuedleLogic', () => {
  const qs = [q('a', 'b', 'left'), q('a', 'c', 'right', { carryover: 'left', bonusItem: 'left' })];

  it('scores main and bonus rounds', () => {
    expect(scoreMain(qs, ['left', 'left'])).toBe(1);
    expect(scoreBonus(qs, ['Al', 'Al'])).toBe(2); // q0 winner=a(Al), q1 bonusItem=left=a(Al)
    expect(scoreBonus(qs, ['Bo', ''])).toBe(0);
  });
  it('picks bonus targets (bonusItem overrides winner)', () => {
    expect(bonusTarget(qs[1]).id).toBe('a');
    expect(winningItems(qs).map((i) => i.id)).toEqual(['a', 'a']);
  });
  it('finds carry-over side', () => {
    expect(carryFromSide(qs, 0)).toBeNull();
    expect(carryFromSide(qs, 1)).toBe('left');
  });
  it('computes pip states', () => {
    expect(pipStates(qs, 0, false, [])).toEqual(['current', 'pending']);
    expect(pipStates(qs, 1, false, ['right'])).toEqual(['wrong', 'current']);
    expect(pipStates(qs, 1, true, ['left', 'right'])).toEqual(['correct', 'correct']);
  });
  it('projects a first-game ranking as provisional', () => {
    const r = projectRanking(null, 3, 5);
    expect(r.gamesPlayed).toBe(1);
    expect(r.isProvisional).toBe(true);
    expect(r.averagePercent).toBeCloseTo(30);
  });
  it('buckets distributions', () => {
    const d = distribution([0, 1, 1, 9], 3);
    expect(d).toHaveLength(4);
    expect(d[1].pct).toBe(50);
    expect(distribution([], 2).every((b) => b.pct === 0)).toBe(true);
  });
  it('formats London date', () => {
    expect(londonDateToday(new Date('2026-01-05T12:00:00Z'))).toBe('2026-01-05');
    expect(londonDateToday(new Date('2026-06-30T23:30:00Z'))).toBe('2026-07-01');
  });
});
