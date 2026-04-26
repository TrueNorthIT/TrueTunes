import { useEffect, useState } from 'react';
import { getActiveProvider } from '../providers';
import type { NormalizedGroup } from '../types/provider';

export function useGroups(): NormalizedGroup[] {
  const [groups, setGroups] = useState<NormalizedGroup[]>([]);

  useEffect(() => {
    const unsub = getActiveProvider().subscribeGroups(setGroups);
    return unsub;
  }, []);

  return groups;
}
