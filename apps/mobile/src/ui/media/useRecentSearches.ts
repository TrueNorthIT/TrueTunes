import { useCallback, useEffect, useState } from 'react';
import { addRecent, clearRecent, loadRecent, removeRecent } from '../../logic/lib/recentSearches';
import { secureKeyValueStore } from '../../platform/secureStore';

/** Recent search queries, persisted in the secure key/value store. */
export function useRecentSearches() {
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    let live = true;
    void loadRecent(secureKeyValueStore).then((l) => {
      if (live) setRecent(l);
    });
    return () => {
      live = false;
    };
  }, []);

  const add = useCallback((q: string) => void addRecent(secureKeyValueStore, q).then(setRecent), []);
  const remove = useCallback((q: string) => void removeRecent(secureKeyValueStore, q).then(setRecent), []);
  const clear = useCallback(() => void clearRecent(secureKeyValueStore).then(setRecent), []);
  return { recent, add, remove, clear };
}
