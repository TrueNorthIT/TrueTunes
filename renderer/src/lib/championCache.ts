// Last week's Queuedle champion, kept in localStorage. The winner of a finished
// week can't change, so it is worked out once (on the first launch after Monday
// 00:00 London) and served from here for the rest of the week. A week nobody
// played is cached too, as a null winner.

import type { WeekRange, WeeklyStanding } from './queuedleWeek';

export type Champion = WeeklyStanding & { range: WeekRange };

export const CHAMPION_CACHE_KEY = 'truetunes.queuedleChampion';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStore(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function isChampion(v: unknown, weekFrom: string): v is Champion {
  if (!v || typeof v !== 'object') return false;
  const c = v as Partial<Champion>;
  return (
    typeof c.userName === 'string' &&
    c.userName.trim() !== '' &&
    typeof c.total === 'number' &&
    typeof c.gamesPlayed === 'number' &&
    typeof c.bestTotal === 'number' &&
    !!c.range &&
    c.range.from === weekFrom &&
    typeof c.range.to === 'string'
  );
}

/**
 * The cached champion for the week starting `weekFrom`: `{ winner }` on a hit
 * (winner may be null: nobody played), or undefined on a miss, which covers a
 * different week, nothing stored, unreadable JSON, a bad shape and a storage
 * that throws.
 */
export function readChampionCache(
  weekFrom: string,
  store: Store | null = defaultStore()
): { winner: Champion | null } | undefined {
  try {
    const raw = store?.getItem(CHAMPION_CACHE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { weekFrom?: unknown; winner?: unknown };
    if (!parsed || typeof parsed !== 'object' || parsed.weekFrom !== weekFrom) return undefined;
    if (parsed.winner === null) return { winner: null };
    return isChampion(parsed.winner, weekFrom) ? { winner: parsed.winner } : undefined;
  } catch {
    return undefined;
  }
}

/** Remembers the week's champion (or that there wasn't one). Storage failures are ignored. */
export function writeChampionCache(
  weekFrom: string,
  winner: Champion | null,
  store: Store | null = defaultStore()
): void {
  try {
    store?.setItem(CHAMPION_CACHE_KEY, JSON.stringify({ weekFrom, winner }));
  } catch {
    // Full or blocked storage: the next launch works it out again.
  }
}
