import { queryOptions, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { STALE } from '../lib/queryDefaults';

export const displayNameKeys = {
  all: ['displayName'] as const,
};

/** The signed-in user's display name; `null` when signed out or unavailable. */
export const displayNameQueryOptions = () =>
  queryOptions({
    queryKey: displayNameKeys.all,
    queryFn: async (): Promise<string | null> => (await window.sonos.getDisplayName().catch(() => null)) ?? null,
    staleTime: STALE.forever,
  });

/** `undefined` until first loaded, then the name or `null` (signed out). */
export function useDisplayName(): string | null | undefined {
  return useQuery(displayNameQueryOptions()).data;
}

/** Re-ask the main process (after Entra sign-in). */
export function refreshDisplayName(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: displayNameKeys.all });
}

export function setDisplayName(queryClient: QueryClient, name: string | null) {
  queryClient.setQueryData(displayNameKeys.all, name);
}

/** Rename; on success every reader of the display name updates. Returns the error, or null. */
export async function renameUser(
  queryClient: QueryClient,
  current: string | null | undefined,
  next: string
): Promise<{ error: string } | null> {
  const result = await window.sonos.renameUser(current ?? '', next).catch(() => ({ error: 'network' }));
  if (result?.error) return { error: result.error };
  setDisplayName(queryClient, next);
  return null;
}

export function useDisplayNameActions() {
  const queryClient = useQueryClient();
  return {
    set: (name: string | null) => setDisplayName(queryClient, name),
    refresh: () => refreshDisplayName(queryClient),
    rename: (current: string | null | undefined, next: string) => renameUser(queryClient, current, next),
  };
}
