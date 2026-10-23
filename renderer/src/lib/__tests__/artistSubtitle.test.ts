import { describe, it, expect } from 'vitest';
import { cardSubtitle, withoutPageArtist } from '../artistSubtitle';

describe('withoutPageArtist', () => {
  it('drops the page artist when they are the only name', () => {
    expect(withoutPageArtist('Cage The Elephant', 'Cage The Elephant')).toBeUndefined();
  });
  it('shows the remaining names after "with"', () => {
    expect(withoutPageArtist('Cage The Elephant, Beck', 'Cage The Elephant')).toBe('with Beck');
    expect(withoutPageArtist('Keane, Everything Everything', 'Everything Everything')).toBe('with Keane');
  });
  it('comma-joins several remaining names', () => {
    expect(withoutPageArtist('A, Page, B', 'Page')).toBe('with A, B');
  });
  it('compares case-insensitively and trimmed', () => {
    expect(withoutPageArtist('  everything EVERYTHING ,Keane', ' Everything Everything ')).toBe('with Keane');
  });
  it('returns the subtitle unchanged without a page artist, undefined when empty', () => {
    expect(withoutPageArtist('Keane', undefined)).toBe('Keane');
    expect(withoutPageArtist('', 'X')).toBeUndefined();
    expect(withoutPageArtist(undefined, 'X')).toBeUndefined();
  });
});

describe('cardSubtitle', () => {
  it('joins year and the trimmed subtitle', () => {
    expect(cardSubtitle(2019, 'Cage The Elephant, Beck', 'Cage The Elephant')).toBe('2019 · with Beck');
  });
  it('is just the year when no other artists remain', () => {
    expect(cardSubtitle(2019, 'Cage The Elephant', 'Cage The Elephant')).toBe('2019');
  });
  it('is undefined with neither year nor others', () => {
    expect(cardSubtitle(undefined, 'Cage The Elephant', 'Cage The Elephant')).toBeUndefined();
  });
});
