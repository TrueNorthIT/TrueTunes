// Recent search queries as pure logic over an injected KeyValueStore.
import type { KeyValueStore } from '../../office/config';

export const RECENT_SEARCHES_KEY = 'recent.searches';
export const MAX_RECENT = 10;
export const MAX_QUERY_LENGTH = 100;

function clean(q: unknown): string {
  return typeof q === 'string' ? q.trim().replace(/\s+/g, ' ').slice(0, MAX_QUERY_LENGTH) : '';
}

/** Normalise: trim, drop blanks/non-strings, dedupe case-insensitively (first wins), cap at MAX_RECENT. */
export function normaliseRecent(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const q = clean(item);
    const key = q.toLowerCase();
    if (!q || seen.has(key)) continue;
    seen.add(key);
    out.push(q);
    if (out.length >= MAX_RECENT) break;
  }
  return out;
}

export async function loadRecent(store: KeyValueStore): Promise<string[]> {
  try {
    const raw = await store.get(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    return normaliseRecent(JSON.parse(raw));
  } catch {
    return [];
  }
}

async function save(store: KeyValueStore, list: string[]): Promise<string[]> {
  try {
    if (list.length === 0) await store.remove(RECENT_SEARCHES_KEY);
    else await store.set(RECENT_SEARCHES_KEY, JSON.stringify(list));
  } catch {
    // Persistence is best-effort; still return the in-memory result.
  }
  return list;
}

/** Add a query at the front (moving an existing case-insensitive match). Returns the new list. */
export async function addRecent(store: KeyValueStore, query: string): Promise<string[]> {
  const q = clean(query);
  const current = await loadRecent(store);
  if (!q) return current;
  return save(store, normaliseRecent([q, ...current]));
}

export async function removeRecent(store: KeyValueStore, query: string): Promise<string[]> {
  const key = clean(query).toLowerCase();
  const current = await loadRecent(store);
  return save(store, current.filter((r) => r.toLowerCase() !== key));
}

export async function clearRecent(store: KeyValueStore): Promise<string[]> {
  return save(store, []);
}
