import { useCallback, useEffect, useRef, useState } from 'react';
import { getActiveProvider } from '../providers';
import type { NormalizedQueueItem } from '../types/provider';

const PAGE = 50;

export function useQueue(
  isAuthed: boolean,
  activeGroupId: string | null,
  queueId: string | null,
  onEtag?: (etag: string) => void,
) {
  const [items, setItems]       = useState<NormalizedQueueItem[]>([]);
  const [isLoading, setLoading] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const hasLoaded                = useRef(false);
  const onEtagRef                = useRef(onEtag);
  useEffect(() => { onEtagRef.current = onEtag; });

  const load = useCallback(async () => {
    if (!activeGroupId) return;
    // Only show the spinner on the very first load — background reloads are silent
    if (!hasLoaded.current) setLoading(true);
    setError(null);

    const all: NormalizedQueueItem[] = [];
    let offset = 0;
    let freshEtag: string | undefined;
    const provider = getActiveProvider();

    while (true) {
      const r = await provider.getQueue({ count: PAGE, offset });
      if (r.error) { setError(r.error); setLoading(false); return; }
      if (offset === 0 && r.etag) freshEtag = r.etag;
      all.push(...r.items);
      if (r.items.length < PAGE) break;
      offset += r.items.length;
    }

    if (freshEtag) onEtagRef.current?.(freshEtag);
    setItems(all);
    hasLoaded.current = true;
    setLoading(false);
  }, [activeGroupId, queueId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isAuthed && activeGroupId) load();
  }, [isAuthed, activeGroupId, load]);

  return { items, setItems, isLoading, error, reload: load };
}
