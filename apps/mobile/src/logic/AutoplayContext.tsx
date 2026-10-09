import { createContext, useContext } from 'react';
import type { AutoplayState } from './hooks/useAutoplay';

/** Autoplay (DJ mode) state from the add-to-queue provider, so the queue screen can show DJ rows. */
export const AutoplayContext = createContext<AutoplayState | null>(null);

export function useAutoplayState(): AutoplayState | null {
  return useContext(AutoplayContext);
}
