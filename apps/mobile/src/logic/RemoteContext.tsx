import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { Remote } from './useRemote';
import { useRemote } from './useRemote';

export const RemoteContext =createContext<Remote | null>(null);

/** Mount once, only while signed in - the hooks underneath talk to Sonos as soon as they mount. */
export function RemoteProvider({ children }: { children: ReactNode }) {
  const remote = useRemote();
  return <RemoteContext.Provider value={remote}>{children}</RemoteContext.Provider>;
}

export function useRemoteContext(): Remote {
  const ctx = useContext(RemoteContext);
  if (!ctx) throw new Error('useRemoteContext must be used within RemoteProvider');
  return ctx;
}
