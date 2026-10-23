import { describe, it, expect, beforeEach, vi } from 'vitest';
import { addRecentSearch, clearRecentSearches, getRecentSearches } from '../recentSearches';

beforeEach(() => localStorage.clear());

describe('recent searches', () => {
  it('keeps the newest first, once each ignoring case and accents, capped at 8', () => {
    addRecentSearch('Beyonce');
    addRecentSearch('Mr Brightside');
    addRecentSearch('beyoncé');
    expect(getRecentSearches()).toEqual(['beyoncé', 'Mr Brightside']);
    for (let i = 0; i < 10; i++) addRecentSearch(`query ${i}`);
    expect(getRecentSearches()).toHaveLength(8);
    expect(getRecentSearches()[0]).toBe('query 9');
  });

  it('ignores one-letter queries and clears', () => {
    addRecentSearch(' a ');
    expect(getRecentSearches()).toEqual([]);
    addRecentSearch('love');
    expect(clearRecentSearches()).toEqual([]);
  });

  it('survives blocked or corrupt storage', () => {
    localStorage.setItem('tt2.recentSearches', '{not json');
    expect(getRecentSearches()).toEqual([]);
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(getRecentSearches()).toEqual([]);
    expect(() => addRecentSearch('love')).not.toThrow();
    spy.mockRestore();
  });
});
