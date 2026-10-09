import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNowPlaying } from '../logic/hooks/useNowPlaying';
import { trackQueryOptions } from '../logic/hooks/useTrackDetails';
import { currentQueueIndex, prefetchWindow, runLimited } from '../logic/lib/prefetch';
import { useRemoteContext } from '../logic/RemoteContext';
import { warmImage } from './imagePrefetch';

/** Fetch track details for this many rows at once; the Sonos API is rate sensitive. */
const CONCURRENCY = 2;

/**
 * Renders nothing. Keeps the artwork the user is about to see already downloaded: the playing
 * track's cover, and for the queue the details (which is where queue art comes from) and image of
 * what plays next, plus the top of the list. The details land in the same React Query cache the
 * queue rows read, so rows also render their text without a flash.
 */
export function ImagePrefetcher() {
  const { playback, queue } = useRemoteContext();
  const np = useNowPlaying(playback);
  const queryClient = useQueryClient();

  useEffect(() => {
    warmImage(np.artUrlRaw);
  }, [np.artUrlRaw]);

  const index = currentQueueIndex(queue.items, playback.currentObjectId, playback.queueItemId);
  const count = queue.items.length;

  useEffect(() => {
    if (count === 0) return;
    let cancelled = false;
    const tasks = prefetchWindow(queue.items, index).map((it) => async () => {
      const { id, serviceId, accountId } = it.track;
      const details = await queryClient.fetchQuery(trackQueryOptions(id, serviceId as string, accountId as string));
      if (!cancelled) warmImage(details?.artUrl ?? it.track.imageUrl);
    });
    void runLimited(tasks, CONCURRENCY, () => cancelled);
    return () => {
      cancelled = true;
    };
    // Re-plan when the queue changes size or the playing item moves; items identity churns on every reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, index, queryClient]);

  return null;
}
