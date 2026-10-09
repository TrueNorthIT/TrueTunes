import { describe, expect, it } from 'vitest';
import {
  activeLyricIndex,
  avatarColor,
  barPercent,
  feedbackIssueUrl,
  lyricOpacity,
  plural,
  statsFooter,
  tierEmoji,
} from '../socialFormat';

const lines = [
  { timeMs: 1000, text: 'a' },
  { timeMs: 5000, text: 'b' },
  { timeMs: 9000, text: 'c' },
];

describe('socialFormat', () => {
  it('finds the active lyric line', () => {
    expect(activeLyricIndex(lines, 0)).toBe(-1);
    expect(activeLyricIndex(lines, 1000)).toBe(0);
    expect(activeLyricIndex(lines, 6000)).toBe(1);
    expect(activeLyricIndex(lines, 99999)).toBe(2);
    expect(activeLyricIndex([], 5)).toBe(-1);
  });
  it('fades lyric lines by distance', () => {
    expect(lyricOpacity(3, -1)).toBe(1);
    expect(lyricOpacity(2, 2)).toBe(1);
    expect(lyricOpacity(3, 2)).toBeCloseTo(0.81);
    expect(lyricOpacity(30, 2)).toBe(0.18);
  });
  it('is deterministic for avatars', () => {
    expect(avatarColor('Rich')).toBe(avatarColor('Rich'));
    expect(avatarColor('Rich')).toMatch(/^hsl\(/);
  });
  it('pluralises and formats footers', () => {
    expect(plural(1, 'game')).toBe('1 game');
    expect(plural(2, 'game')).toBe('2 games');
    expect(statsFooter(1, 0, 'Bob')).toBe('1 queue event by Bob total');
    expect(statsFooter(3, 0)).toBe('3 queue events total');
    expect(statsFooter(3, Date.now())).toContain('since');
  });
  it('computes bar percent safely', () => {
    expect(barPercent(5, 10)).toBe(50);
    expect(barPercent(5, 0)).toBe(0);
    expect(barPercent(50, 10)).toBe(100);
  });
  it('maps tiers and builds issue urls', () => {
    expect(tierEmoji('playlist-prophet')).toBe('🏆');
    expect(tierEmoji('nope')).toBe('🎵');
    const u = feedbackIssueUrl('bug', ' T ', 'desc', 'Bob');
    expect(u).toContain('issues/new?title=T');
    expect(u).toContain('labels=bug');
    expect(feedbackIssueUrl('feature', 't', 'd')).toContain('labels=enhancement');
  });
});
