import { norm } from './shelfSearch';

const KEY = 'tt2.recentSearches';
const MAX = 8;

/** This viewer's recent searches, newest first. Storage can be missing or blocked: then there are none. */
export function getRecentSearches(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string').slice(0, MAX) : [];
  } catch {
    return [];
  }
}

function save(list: string[]): string[] {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage blocked: recents just don't persist */
  }
  return list;
}

/** Puts the query at the front (once, ignoring case and accents) and returns the new list. */
export function addRecentSearch(query: string): string[] {
  const q = query.trim();
  if (q.length < 2) return getRecentSearches();
  return save([q, ...getRecentSearches().filter((s) => norm(s) !== norm(q))].slice(0, MAX));
}

export function clearRecentSearches(): string[] {
  return save([]);
}
