import { describe, it, expect } from 'vitest';
import { groupByDay, ordinal, officeRank, profileFacts, queuedCount } from '../profileData';

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

describe('queuedCount', () => {
  const stats = (topUsers: StatsUser[], totalEvents: number) =>
    ({ topUsers, topTracks: [], topArtists: [], topAlbums: [], totalEvents, periodStart: 0 }) as StatsResult;
  it('is their topUsers count, which leaves out album-add events', () => {
    expect(queuedCount(stats([{ userId: 'Joe', count: 967 }], 1035), 'Joe')).toBe(967);
  });
  it('falls back to totalEvents when they are not listed, and 0 with no stats', () => {
    expect(queuedCount(stats([], 12), 'Joe')).toBe(12);
    expect(queuedCount(undefined, 'Joe')).toBe(0);
  });
});

describe('profileFacts', () => {
  const now = new Date('2026-10-22T15:00:00').getTime();
  it('lists queued, the past 7 days and place in the office', () => {
    expect(profileFacts({ queued: 967, recentQueued: 72, rank: 5, now })).toEqual([
      '967 queued', '72 in the past 7 days', '5th most active in the office',
    ]);
  });
  it('says "most active" for first, and drops zeroes and unknowns', () => {
    expect(profileFacts({ queued: 1035, recentQueued: 0, rank: 1, now })).toEqual(['1,035 queued', 'Most active in the office']);
    expect(profileFacts({ queued: 0, recentQueued: 0, rank: null, now })).toEqual([]);
  });
  it('adds when they last queued, if given', () => {
    expect(profileFacts({ queued: 238, recentQueued: 0, rank: 10, lastQueued: now - 49 * 86_400_000, now })).toEqual([
      '238 queued', '10th most active in the office', 'Last queued 7 weeks ago',
    ]);
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
