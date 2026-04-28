import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/sonosApi';

export type RestoreCandidate = RecentQueuedTrack;

export interface RestoreSummary {
  added: number;
  failed: number;
  firstError?: string;
}

export interface RestoreParams {
  queueId?: string;
  initialEtag?: string;
  onEtagChange?: (etag: string) => void;
  reloadEtag?: () => Promise<string | undefined>;
}

function buildAddBody(t: RestoreCandidate) {
  return {
    id: {
      objectId: t.uri,
      serviceId: t.serviceId,
      accountId: t.accountId.replace(/^sn_/, ''),
    },
    type: 'TRACK',
  };
}

export async function restoreTracks(
  tracks: RestoreCandidate[],
  params: RestoreParams,
): Promise<RestoreSummary> {
  let etag = params.initialEtag;
  let added = 0;
  let failed = 0;
  let firstError: string | undefined;

  for (const t of tracks) {
    const body = buildAddBody(t);
    let result = await api.queue.add(body, {
      queueId: params.queueId,
      ifMatch: etag,
      position: -1,
    });

    if (result.error && params.reloadEtag) {
      const fresh = await params.reloadEtag();
      if (fresh) etag = fresh;
      result = await api.queue.add(body, {
        queueId: params.queueId,
        ifMatch: etag,
        position: -1,
      });
    }

    if (result.error) {
      failed++;
      if (!firstError) firstError = result.error;
      continue;
    }

    added++;
    if (result.etag) {
      etag = result.etag;
      params.onEtagChange?.(result.etag);
    }
  }

  return { added, failed, firstError };
}

function startOfTodayLocalMs(now: Date = new Date()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function useRestoreQueuePreview(enabled: boolean) {
  const sinceMs = startOfTodayLocalMs();
  return useQuery<RecentQueuedResult>({
    queryKey: ['recent-queued', sinceMs],
    queryFn: () => window.sonos.fetchRecentQueued(sinceMs),
    enabled,
    staleTime: 60_000,
    retry: 1,
  });
}

export function useRestoreQueueAction() {
  const [isRestoring, setRestoring] = useState(false);

  const run = useCallback(async (
    tracks: RestoreCandidate[],
    params: RestoreParams,
  ): Promise<RestoreSummary> => {
    setRestoring(true);
    try {
      const summary = await restoreTracks(tracks, params);
      void window.sonos.trackEvent('queue_restore', {
        count: String(tracks.length),
        added: String(summary.added),
        failed: String(summary.failed),
      });
      return summary;
    } finally {
      setRestoring(false);
    }
  }, []);

  return { restore: run, isRestoring };
}
