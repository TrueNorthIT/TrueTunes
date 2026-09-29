import { useQuery } from '@tanstack/react-query';

export function useUsers(enabled = true, includeSelf = false) {
  return useQuery<UserSummary[]>({
    // Keyed on includeSelf — otherwise the "everyone else" list served to
    // HomePanel would be handed to callers that need the whole room.
    queryKey: ['users', includeSelf],
    queryFn: () => window.sonos.fetchUsers(includeSelf),
    enabled,
    staleTime: 5 * 60_000,
  });
}
