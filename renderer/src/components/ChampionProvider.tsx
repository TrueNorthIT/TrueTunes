import type { ReactNode } from 'react';
import { useDisplayName } from '../hooks/useDisplayName';
import { useLastWeekWinner } from '../hooks/useDailyGame';
import { ChampionContext } from '../lib/champion';

/** Runs the one weekly champion query (and its Monday roll-over timer) for everything under it. */
export function ChampionProvider({ children }: { children: ReactNode }) {
  const displayName = useDisplayName();
  const champion = useLastWeekWinner(displayName).data ?? null;
  return <ChampionContext.Provider value={champion}>{children}</ChampionContext.Provider>;
}
