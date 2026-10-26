import { describe, it, expect, beforeEach } from 'vitest';
import { CHAMPION_CACHE_KEY, readChampionCache, writeChampionCache } from '../championCache';
import type { Champion } from '../championCache';

const range = { from: '2026-10-19', to: '2026-10-25' };
const rich: Champion = { userName: 'Rich', total: 65, gamesPlayed: 5, bestTotal: 18, range };

function memoryStore() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    map,
  };
}

describe('champion cache', () => {
  let store: ReturnType<typeof memoryStore>;
  beforeEach(() => {
    store = memoryStore();
  });

  it('is a miss when nothing is stored', () => {
    expect(readChampionCache(range.from, store)).toBeUndefined();
  });

  it('hits for the same week, and serves the stored winner', () => {
    writeChampionCache(range.from, rich, store);
    expect(readChampionCache(range.from, store)).toEqual({ winner: rich });
  });

  it('misses once a new week starts', () => {
    writeChampionCache(range.from, rich, store);
    expect(readChampionCache('2026-10-26', store)).toBeUndefined();
  });

  it('caches a week nobody played as a null winner, which is a hit', () => {
    writeChampionCache(range.from, null, store);
    expect(readChampionCache(range.from, store)).toEqual({ winner: null });
  });

  it('treats corrupt or wrongly shaped storage as a miss', () => {
    store.map.set(CHAMPION_CACHE_KEY, '{not json');
    expect(readChampionCache(range.from, store)).toBeUndefined();
    store.map.set(CHAMPION_CACHE_KEY, JSON.stringify({ weekFrom: range.from, winner: { userName: 'Rich' } }));
    expect(readChampionCache(range.from, store)).toBeUndefined();
    store.map.set(CHAMPION_CACHE_KEY, JSON.stringify({ weekFrom: range.from }));
    expect(readChampionCache(range.from, store)).toBeUndefined();
    // A winner whose own week disagrees with the key isn't trusted either.
    store.map.set(
      CHAMPION_CACHE_KEY,
      JSON.stringify({ weekFrom: range.from, winner: { ...rich, range: { from: '2026-10-12', to: '2026-10-18' } } })
    );
    expect(readChampionCache(range.from, store)).toBeUndefined();
  });

  it('survives storage that throws, on read and on write', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(readChampionCache(range.from, broken)).toBeUndefined();
    expect(() => writeChampionCache(range.from, rich, broken)).not.toThrow();
  });

  it('uses localStorage by default', () => {
    localStorage.removeItem(CHAMPION_CACHE_KEY);
    writeChampionCache(range.from, rich);
    expect(readChampionCache(range.from)).toEqual({ winner: rich });
    localStorage.removeItem(CHAMPION_CACHE_KEY);
  });
});
