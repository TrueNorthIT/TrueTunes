import { useCallback, useEffect, useRef } from 'react';
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { getActiveProvider } from '../providers';
import { STALE } from '../lib/queryDefaults';
import type { NormalizedQueueItem } from '../types/provider';

const PAGE = 50;
const NO_ITEMS: NormalizedQueueItem[] = [];

export const queueKeys = {
  all: ['queue'] as const,
  list: (groupId: string) => [...queueKeys.all, groupId] as const,
};

export interface QueueData {
  items: NormalizedQueueItem[];
  /** Etag of the first page: the `If-Match` for the next write. */
  etag?: string;
}

/**
 * The whole queue, paged in 50s. `onEtag` is called from inside the fetch, so a caller awaiting a
 * refetch sees the fresh etag before it resolves.
 *
 * Fresh until told otherwise: Sonos pushes a new `queueVersion` on every change, and `useQueue`
 * turns that into an invalidation. A timer would only refetch a queue that hasn't changed.
 */
export function queueQueryOptions(groupId: string, onEtag?: (etag: string) => void) {
  return queryOptions({
    queryKey: queueKeys.list(groupId),
    staleTime: STALE.forever,
    retry: false, // a transient 5xx during queue propagation is retried by the next version push
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<QueueData> => {
      const items: NormalizedQueueItem[] = [];
      let offset = 0;
      let etag: string | undefined;
      const provider = getActiveProvider();
      while (true) {
        const r = await provider.getQueue({ count: PAGE, offset });
        if (r.error) throw new Error(r.error);
        if (offset === 0 && r.etag) etag = r.etag;
        items.push(...r.items);
        if (r.items.length < PAGE) break;
        offset += r.items.length;
      }
      if (etag) onEtag?.(etag);
      return { items, etag };
    },
  });
}

type Updater = NormalizedQueueItem[] | ((prev: NormalizedQueueItem[]) => NormalizedQueueItem[]);

/**
 * Optimistic edits to the cached queue. Returns a function that applies one and hands back its
 * rollback, which restores exactly what was there before.
 */
export function useEditQueue(groupId: string | null) {
  const queryClient = useQueryClient();
  return useCallback(
    (updater: Updater) => {
      if (!groupId) return () => {};
      const key = queueKeys.list(groupId);
      const prev = queryClient.getQueryData<QueueData>(key);
      queryClient.setQueryData<QueueData>(key, (old) => ({
        ...old,
        items: typeof updater === 'function' ? updater(old?.items ?? NO_ITEMS) : updater,
      }));
      return () => {
        queryClient.setQueryData<QueueData>(key, prev);
      };
    },
    [queryClient, groupId]
  );
}

export function useQueue(
  isAuthed: boolean,
  activeGroupId: string | null,
  queueId: string | null,
  onEtag?: (etag: string) => void,
  onReloadError?: (msg: string) => void,
  queueVersion?: string | null
) {
  const queryClient = useQueryClient();
  const enabled = isAuthed && !!activeGroupId;
  const groupId = activeGroupId ?? '';
  const query = useQuery({ ...queueQueryOptions(groupId, onEtag), enabled });

  // A background reload that fails keeps the items on screen and reports through the callback;
  // only a failed first load replaces the queue with an error.
  const onReloadErrorRef = useRef(onReloadError);
  useEffect(() => {
    onReloadErrorRef.current = onReloadError;
  });
  const reloadFailed = query.isRefetchError ? query.error.message : null;
  useEffect(() => {
    if (reloadFailed) onReloadErrorRef.current?.(reloadFailed);
  }, [reloadFailed, query.errorUpdatedAt]);

  // Sonos reports a new queue version for every change, including other people's. First mount
  // joins the load already in flight rather than starting a second one.
  useEffect(() => {
    if (enabled) {
      void queryClient.invalidateQueries({ queryKey: queueKeys.list(groupId) }, { cancelRefetch: false });
    }
  }, [queryClient, enabled, groupId, queueId, queueVersion]);

  const { refetch } = query;
  const reload = useCallback(async () => {
    if (enabled) await refetch();
  }, [enabled, refetch]);

  return {
    items: query.data?.items ?? NO_ITEMS,
    isLoading: query.isLoading,
    error: query.data ? null : (query.error?.message ?? null),
    reload,
  };
}
