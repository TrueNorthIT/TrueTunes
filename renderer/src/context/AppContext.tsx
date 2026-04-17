import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';

interface AppContextValue {
  isAuthed: boolean;
  setIsAuthed: (v: boolean) => void;
  activeGroupId: string | null;
  setActiveGroupId: (id: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [isAuthed, setIsAuthed]         = useState(false);
  const [activeGroupId, setActiveGroupIdState] = useState<string | null>(null);

  const setActiveGroupId = useCallback((id: string) => {
    setActiveGroupIdState(id);
  }, []);

  return (
    <AppContext.Provider value={{ isAuthed, setIsAuthed, activeGroupId, setActiveGroupId }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
