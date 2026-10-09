import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { lyricsQueryOptions } from './useLyrics';
import { geniusDescriptionQueryOptions } from './useGeniusDescription';
import type { NormalizedQueueItem } from '../types/provider';

export function usePrefetchNextLyrics(
  items: NormalizedQueueItem[],
  queueItemId: string | null,
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!queueItemId) return;
    const next = items[Number(queueItemId)]; // queueItemId is 1-based, so index = id - 1 + 1 = id
    if (!next) return;
    const { title, artist, albumName, durationMs } = next.track;
    queryClient.prefetchQuery(lyricsQueryOptions(title, artist, albumName, durationMs));
    queryClient.prefetchQuery(geniusDescriptionQueryOptions(title, artist));
  }, [queryClient, items, queueItemId]);
}
