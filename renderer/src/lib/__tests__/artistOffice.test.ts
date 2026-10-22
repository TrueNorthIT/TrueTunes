import { describe, it, expect } from 'vitest';
import { officeLineFor } from '../artistOffice';

const top: StatsArtist[] = [
  { artist: 'The Black Keys', artistId: 'a1', count: 27 },
  { artist: 'Wiley', count: 1 },
];

describe('officeLineFor', () => {
  it('matches by id', () => {
    expect(officeLineFor(top, 'a1', 'Someone else')).toBe('Played here 27 times');
  });
  it('falls back to the normalised name, ignoring "the" and punctuation', () => {
    expect(officeLineFor(top, undefined, 'black keys')).toBe('Played here 27 times');
  });
  it('says once for a single play', () => {
    expect(officeLineFor(top, undefined, 'WILEY')).toBe('Played here once');
  });
  it('is undefined with no data or no match', () => {
    expect(officeLineFor(undefined, 'a1', 'x')).toBeUndefined();
    expect(officeLineFor(top, 'zz', 'Nobody')).toBeUndefined();
  });
});
