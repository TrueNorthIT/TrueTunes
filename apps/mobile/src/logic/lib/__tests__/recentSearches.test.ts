import { describe, it, expect } from 'vitest';
import type { KeyValueStore } from '../../../office/config';
import { addRecent, clearRecent, loadRecent, MAX_RECENT, normaliseRecent, RECENT_SEARCHES_KEY, removeRecent } from '../recentSearches';

function memStore(initial?: string): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(RECENT_SEARCHES_KEY, initial);
  return {
    data,
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => void data.set(k, v),
    remove: async (k) => void data.delete(k),
  };
}

describe('recentSearches', () => {
  it('loads empty when nothing stored', async () => {
    expect(await loadRecent(memStore())).toEqual([]);
  });
  it('tolerates invalid JSON and wrong shapes', async () => {
    expect(await loadRecent(memStore('{oops'))).toEqual([]);
    expect(await loadRecent(memStore('{"a":1}'))).toEqual([]);
    expect(await loadRecent(memStore('null'))).toEqual([]);
    expect(await loadRecent(memStore('["a",3,null,"  ","b"]'))).toEqual(['a', 'b']);
  });
  it('tolerates a throwing store', async () => {
    const boom = async () => {
      throw new Error('x');
    };
    const bad: KeyValueStore = { get: boom, set: boom, remove: boom };
    expect(await loadRecent(bad)).toEqual([]);
    expect(await addRecent(bad, 'abba')).toEqual(['abba']);
  });
  it('adds most-recent-first and trims', async () => {
    const s = memStore();
    await addRecent(s, '  abba ');
    expect(await addRecent(s, 'queen')).toEqual(['queen', 'abba']);
    expect(JSON.parse(s.data.get(RECENT_SEARCHES_KEY)!)).toEqual(['queen', 'abba']);
  });
  it('ignores blank queries', async () => {
    const s = memStore();
    expect(await addRecent(s, '   ')).toEqual([]);
    expect(s.data.size).toBe(0);
  });
  it('dedupes case-insensitively, moving to front with latest casing', async () => {
    const s = memStore();
    await addRecent(s, 'Abba');
    await addRecent(s, 'queen');
    expect(await addRecent(s, 'ABBA')).toEqual(['ABBA', 'queen']);
  });
  it('collapses inner whitespace', async () => {
    expect(await addRecent(memStore(), 'a   b')).toEqual(['a b']);
  });
  it('caps at MAX_RECENT dropping oldest', async () => {
    const s = memStore();
    for (let i = 0; i < 15; i++) await addRecent(s, `q${i}`);
    const list = await loadRecent(s);
    expect(list).toHaveLength(MAX_RECENT);
    expect(list[0]).toBe('q14');
    expect(list[MAX_RECENT - 1]).toBe('q5');
  });
  it('normalise caps oversized stored lists', () => {
    expect(normaliseRecent(Array.from({ length: 30 }, (_, i) => `x${i}`))).toHaveLength(MAX_RECENT);
  });
  it('removes case-insensitively', async () => {
    const s = memStore(JSON.stringify(['a', 'B', 'c']));
    expect(await removeRecent(s, 'b')).toEqual(['a', 'c']);
    expect(await removeRecent(s, 'zzz')).toEqual(['a', 'c']);
  });
  it('clear removes the key', async () => {
    const s = memStore(JSON.stringify(['a']));
    expect(await clearRecent(s)).toEqual([]);
    expect(s.data.has(RECENT_SEARCHES_KEY)).toBe(false);
  });
  it('removing the last entry removes the key', async () => {
    const s = memStore(JSON.stringify(['a']));
    await removeRecent(s, 'a');
    expect(s.data.has(RECENT_SEARCHES_KEY)).toBe(false);
  });
});
