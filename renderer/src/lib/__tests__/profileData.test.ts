import { describe, it, expect } from 'vitest';
import { groupByDay, ordinal, officeRank, profileFacts } from '../profileData';

describe('ordinal', () => {
  it('handles the teens and the st/nd/rd endings', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th',
    ]);
  });
});

describe('officeRank', () => {
  const top = [{ userId: 'Alex', count: 30 }, { userId: 'Rich', count: 20 }];
  it('is the 1-based position in topUsers', () => {
    expect(officeRank(top, 'Rich')).toBe(2);
  });
  it('is null for someone outside the list, or with no stats', () => {
    expect(officeRank(top, 'Aidan')).toBeNull();
    expect(officeRank(undefined, 'Rich')).toBeNull();
  });
});

describe('profileFacts', () => {
  it('lists plays, this week and place in the office', () => {
    expect(profileFacts({ plays: 1035, weekPlays: 72, rank: 5 })).toEqual([
      '1,035 plays', '72 this week', '5th most active in the office',
    ]);
  });
  it('says "most active" for first, singular for one play, and drops zeroes and unknowns', () => {
    expect(profileFacts({ plays: 1, weekPlays: 0, rank: 1 })).toEqual(['1 play', 'Most active in the office']);
    expect(profileFacts({ plays: 0, weekPlays: 0, rank: null })).toEqual([]);
  });
});

describe('groupByDay', () => {
  const now = new Date('2026-10-22T15:00:00').getTime();
  const at = (h: number) => ({ lastPlayed: now - h * 3_600_000 });
  it('runs consecutive plays from the same day together, keeping order', () => {
    const items = [at(1), at(2), at(30), at(80)];
    expect(groupByDay(items, now)).toEqual([
      { day: 'Today', items: [items[0], items[1]] },
      { day: 'Yesterday', items: [items[2]] },
      { day: '3 days ago', items: [items[3]] },
    ]);
  });
  it('is empty for no plays', () => {
    expect(groupByDay([], now)).toEqual([]);
  });
});
