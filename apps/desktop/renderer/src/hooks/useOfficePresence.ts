import { useQuery } from '@tanstack/react-query';

export function officePresenceQueryOptions() {
  return {
    queryKey: ['office-presence'],
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
    staleTime: 2 * 60_000,
    retry: 1,
  };
}

export function useOfficePresence(enabled = true) {
  return useQuery<OfficePresence>({ ...officePresenceQueryOptions(), enabled });
}
