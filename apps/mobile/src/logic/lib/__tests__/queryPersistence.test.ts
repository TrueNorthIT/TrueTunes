import { describe, expect, it } from 'vitest';
import { isSearchable } from '../searchRules';
import { shouldPersistQuery } from '../queryPersistence';

const q = (queryKey: unknown[], status = 'success') => ({ queryKey, state: { status } });

describe('shouldPersistQuery', () => {
  it('keeps loaded track details', () => expect(shouldPersistQuery(q(['track', 'abc']))).toBe(true));
  it('drops track queries that are loading or failed', () => {
    expect(shouldPersistQuery(q(['track', 'abc'], 'pending'))).toBe(false);
    expect(shouldPersistQuery(q(['track', 'abc'], 'error'))).toBe(false);
  });
  it('drops everything that is not a track-detail query', () => {
    for (const key of [['search', 'x'], ['ytm-sections'], ['playlist', 'fav-x'], ['track'], ['tracks', 'abc'], [['track', 'abc']]]) {
      expect(shouldPersistQuery(q(key as unknown[]))).toBe(false);
    }
  });
});

describe('isSearchable', () => {
  it('needs two visible characters', () => {
    expect(isSearchable('')).toBe(false);
    expect(isSearchable('a')).toBe(false);
    expect(isSearchable('  a  ')).toBe(false);
    expect(isSearchable('ab')).toBe(true);
    expect(isSearchable(' ab ')).toBe(true);
  });
});
