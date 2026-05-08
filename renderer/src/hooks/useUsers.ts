import { useQuery } from '@tanstack/react-query';

export function useUsers(enabled = true) {
  return useQuery<UserSummary[]>({
    queryKey: ['users'],
    queryFn: () => window.sonos.fetchUsers(),
    enabled,
    staleTime: 5 * 60_000,
  });
}
