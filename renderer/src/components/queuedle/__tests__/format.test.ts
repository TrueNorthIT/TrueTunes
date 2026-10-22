import { describe, it, expect } from 'vitest';
import { competitionRanks, formatGameDate, formatGameDateShort, itemSubLine, ordinal, playedLine, standingLine } from '../format';

describe('Queuedle format helpers', () => {
  it('formats a game id as a long and a short date', () => {
    expect(formatGameDate('2026-10-22')).toBe('Thursday 22 October 2026');
    expect(formatGameDateShort('2026-10-22')).toBe('22 Oct');
    expect(formatGameDate('not-a-date')).toBe('not-a-date');
  });

  it('writes ordinals, including the teens', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st', '111th',
    ]);
  });

  it('gives equal totals the same place', () => {
    expect(competitionRanks([16, 16, 15, 14, 14, 10])).toEqual([1, 1, 3, 4, 4, 6]);
    expect(competitionRanks([10, 16])).toEqual([2, 1]);
  });

  it('names who has played, then counts the rest', () => {
    expect(playedLine(['Alex'])).toBe('Alex has played today');
    expect(playedLine(['Alex', 'Rich'])).toBe('Alex and Rich have played today');
    expect(playedLine(['Alex', 'Rich', 'Sam'])).toBe('Alex, Rich and Sam have played today');
    expect(playedLine(['Alex', 'Rich', 'Sam', 'Bog', 'Abbie'])).toBe('Alex, Rich and 3 others have played today');
    expect(playedLine(['Alex'], true)).toBe('Alex played this one');
  });

  it('describes a standing among the room', () => {
    expect(standingLine(16, [16, 15, 14, 10], false)).toBe('Joint 1st of 5 today');
    expect(standingLine(15, [16, 16, 14], false)).toBe('3rd of 4 today');
    expect(standingLine(9, [], false)).toBe('First to play today');
    expect(standingLine(9, [12], true)).toBe('2nd of 2');
  });

  it('writes an item sub line without repeating an artist', () => {
    const base = { id: '1', name: 'x', count: 1, topQueuer: 'a', queuerCandidates: [] };
    expect(itemSubLine({ ...base, category: 'track', subtitle: 'Abbey Road' })).toBe('Track · Abbey Road');
    expect(itemSubLine({ ...base, category: 'artist', subtitle: 'Artist' })).toBe('Artist');
    expect(itemSubLine({ ...base, category: 'album', subtitle: '' })).toBe('Album');
  });
});
