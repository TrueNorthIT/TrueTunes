import { useEffect, useRef, useState } from 'react';
import type { GroupInfo } from '../types/sonos';

export function useGroups(): GroupInfo[] {
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const registered = useRef(false);

  useEffect(() => {
    if (registered.current) return;
    registered.current = true;
    window.sonos.onWsGroups((raw) => {
      setGroups(raw as GroupInfo[]);
    });
  }, []);

  return groups;
}
