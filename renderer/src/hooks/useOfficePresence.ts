import { queryOptions, useQuery } from '@tanstack/react-query';
import { STALE } from '../lib/queryDefaults';

export const officePresenceKeys = {
  all: ['office-presence'] as const,
};

export function officePresenceQueryOptions() {
  return queryOptions({
    queryKey: officePresenceKeys.all,
    queryFn: async (): Promise<OfficePresence> => {
      const res = await window.sonos.fetchOfficePresence();
      return {
        inOffice: res?.inOffice ?? [],
        basis: res?.basis ?? 'none',
        observed: res?.observed ?? 0,
        detail: res?.detail ?? [],
        error: res?.error,
      };
    },
    // People wander in and out; a couple of minutes is fresh enough and keeps
    // us well inside Graph's rate limit.
    staleTime: STALE.twoMinutes,
    retry: 1,
  });
}

export function useOfficePresence(enabled = true) {
  return useQuery({ ...officePresenceQueryOptions(), enabled });
}
