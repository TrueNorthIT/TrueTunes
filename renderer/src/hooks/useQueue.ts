import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/sonosApi';
import { extractItems } from '../lib/itemHelpers';
import type { QueueItem } from '../types/sonos';

const PAGE = 50;

export function useQueue(isAuthed: boolean, activeGroupId: string | null, queueId: string | null) {
  const [items, setItems]       = useState<QueueItem[]>([]);
  const [isLoading, setLoading] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const hasLoaded                = useRef(false);

  const load = useCallback(async () => {
    if (!activeGroupId) return;
    // Only show the spinner on the very first load — background reloads are silent
    if (!hasLoaded.current) setLoading(true);
    setError(null);

    const all: QueueItem[] = [];
    let offset = 0;
    while (true) {
      const r = await api.queue.list({ queueId: queueId ?? undefined, count: PAGE, offset });
      if (r.error) { setError(r.error); setLoading(false); return; }
      const page = extractItems(r.data) as QueueItem[];
      all.push(...page);
      if (page.length < PAGE) break;
      offset += page.length;
    }

    setItems(all);
    hasLoaded.current = true;
    setLoading(false);
  }, [activeGroupId, queueId]);

  useEffect(() => {
    if (isAuthed && activeGroupId) load();
  }, [isAuthed, activeGroupId, load]);

  return { items, setItems, isLoading, error, reload: load };
}
