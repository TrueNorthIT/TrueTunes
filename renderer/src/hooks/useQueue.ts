import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/sonosApi';
import { extractItems } from '../lib/itemHelpers';
import type { QueueItem } from '../types/sonos';

const PAGE = 50;

export function useQueue(isAuthed: boolean, activeGroupId: string | null) {
  const [items, setItems]       = useState<QueueItem[]>([]);
  const [isLoading, setLoading] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeGroupId) return;
    setLoading(true);
    setError(null);

    const all: QueueItem[] = [];
    let offset = 0;
    while (true) {
      const r = await api.queue.list({ count: PAGE, offset });
      if (r.error) { setError(r.error); setLoading(false); return; }
      const page = extractItems(r.data) as QueueItem[];
      all.push(...page);
      if (page.length < PAGE) break;
      offset += page.length;
    }

    setItems(all);
    setLoading(false);
  }, [activeGroupId]);

  useEffect(() => {
    if (isAuthed && activeGroupId) load();
  }, [isAuthed, activeGroupId, load]);

  return { items, isLoading, error, reload: load };
}
