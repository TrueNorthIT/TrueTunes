import { useEffect, useState } from 'react';
import type { GroupInfo } from '../types/sonos';

export function useGroups(): GroupInfo[] {
  const [groups, setGroups] = useState<GroupInfo[]>([]);

  useEffect(() => {
    const unsub = window.sonos.onWsGroups((raw) => setGroups(raw as GroupInfo[]));
    return unsub;
  }, []);

  return groups;
}
