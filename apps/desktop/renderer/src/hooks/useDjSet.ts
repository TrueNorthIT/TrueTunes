import { useQuery } from '@tanstack/react-query';

interface DjSetOptions {
  users?: string[];
  limit?: number;
  excludeUris?: string[];
}

/**
 * A failed fetch comes back as `{ error }` with no arrays on it. Filling them in
 * here means no component has to guard every field — reaching straight for
 * `data.listeners.includes(...)` on an error response was a crash.
 */
function normalise(res: DjSetResponse | null | undefined): DjSetResult {
  return {
    tracks: res?.tracks ?? [],
    artists: res?.artists ?? [],
    listeners: res?.listeners ?? [],
    artistsConsidered: res?.artistsConsidered ?? 0,
    inferredListeners: res?.inferredListeners ?? true,
    error: res?.error,
  };
}

export function djSetQueryOptions(opts: DjSetOptions = {}) {
  return {
    queryKey: ['dj', opts.users ?? null, opts.limit ?? null, opts.excludeUris?.length ?? 0],
    queryFn: async (): Promise<DjSetResult> => normalise(await window.sonos.fetchDjSet(opts)),
    // The set is built from 90 days of history — it doesn't shift minute to minute,
    // and refetching on every focus would reshuffle the list under the user's cursor.
    staleTime: 5 * 60_000,
    retry: 1,
  };
}

export function useDjSet(opts: DjSetOptions = {}, enabled = true) {
  return useQuery<DjSetResult>({ ...djSetQueryOptions(opts), enabled });
}
