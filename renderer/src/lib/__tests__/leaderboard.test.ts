import { describe, it, expect } from 'vitest';
import { mergeArtists, queuedSummary } from '../leaderboard';

const users = (...counts: number[]) => counts.map((count, i) => ({ userId: `u${i}`, count }));

describe('queuedSummary', () => {
  it('sums the people, not the server total', () => {
    expect(queuedSummary(users(240, 98, 7), 'in the past 7 days')).toBe('345 tracks queued in the past 7 days');
  });

  it('says "At least" once the server cap of ten people is reached', () => {
    expect(queuedSummary(users(...Array(10).fill(1000)), 'in all')).toBe('At least 10,000 tracks queued in all');
  });

  it('is singular for one track and null for none', () => {
    expect(queuedSummary(users(1), 'today')).toBe('1 track queued today');
    expect(queuedSummary([], 'today')).toBeNull();
  });
});

describe('mergeArtists', () => {
  it('merges spellings that differ only in case, keeping the busiest name and summing counts', () => {
    const merged = mergeArtists([
      { artist: 'Muse', count: 20 },
      { artist: 'FONTAINES D.C.', count: 11 },
      { artist: 'Fontaines D.C.', count: 13, artistId: 'fdc' },
    ]);
    expect(merged).toEqual([
      { artist: 'Fontaines D.C.', count: 24, artistId: 'fdc' },
      { artist: 'Muse', count: 20 },
    ]);
  });

  it('fills a missing id from a quieter spelling', () => {
    const [a] = mergeArtists([
      { artist: 'Justice', count: 9 },
      { artist: 'JUSTICE', count: 2, artistId: 'j', serviceId: 's', accountId: 'a', imageUrl: 'i' },
    ]);
    expect(a).toEqual({ artist: 'Justice', count: 11, artistId: 'j', serviceId: 's', accountId: 'a', imageUrl: 'i' });
  });

  it('does not mutate its input', () => {
    const input = [
      { artist: 'A', count: 1 },
      { artist: 'a', count: 1 },
    ];
    mergeArtists(input);
    expect(input).toEqual([
      { artist: 'A', count: 1 },
      { artist: 'a', count: 1 },
    ]);
  });
});
