import { describe, it, expect } from 'vitest';
import { officeCountFor } from '../artistOffice';

const top: StatsArtist[] = [
  { artist: 'The Black Keys', artistId: 'a1', count: 27 },
  { artist: 'Wiley', count: 1 },
];

describe('officeCountFor', () => {
  it('matches by id', () => {
    expect(officeCountFor(top, 'a1', 'Someone else')).toBe(27);
  });
  it('falls back to the normalised name, ignoring "the" and punctuation', () => {
    expect(officeCountFor(top, undefined, 'black keys')).toBe(27);
    expect(officeCountFor(top, undefined, 'WILEY')).toBe(1);
  });
  it('is undefined with no data or no match', () => {
    expect(officeCountFor(undefined, 'a1', 'x')).toBeUndefined();
    expect(officeCountFor(top, 'zz', 'Nobody')).toBeUndefined();
  });
});
