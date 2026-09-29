import { useQuery, useQueryClient } from '@tanstack/react-query';

export function useUserProfile(userName: string | undefined) {
  return useQuery<UserProfile | null>({
    queryKey: ['user-profile', userName],
    queryFn: async () => {
      const r = await window.sonos.fetchUserProfile(userName!);
      return r ?? null;
    },
    enabled: !!userName,
    staleTime: 5 * 60_000,
  });
}

export function useInvalidateUserProfile() {
  const queryClient = useQueryClient();
  return (userName: string) =>
    queryClient.invalidateQueries({ queryKey: ['user-profile', userName] });
}
