import { createContext, useContext } from 'react';
import type { Champion } from './championCache';
import { formatWeekRange } from './queuedleWeek';

/**
 * Last week's Queuedle champion, for the whole app. ChampionProvider fills it from the one
 * weekly query; anything outside a provider (stories, tests) sees null, so no one is crowned.
 */
export const ChampionContext = createContext<Champion | null>(null);

export function useChampion(): Champion | null {
  return useContext(ChampionContext);
}

const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

/** The champion when `name` is them, else null. */
export function useChampionFor(name: string | null | undefined): Champion | null {
  const champion = useChampion();
  return champion && name && sameName(champion.userName, name) ? champion : null;
}

/** "Queuedle champion, week of 19–25 Oct": the words that go with the gold, so it isn't colour alone. */
export function championLabel(champion: Champion): string {
  return `Queuedle champion, week of ${formatWeekRange(champion.range)}`;
}
