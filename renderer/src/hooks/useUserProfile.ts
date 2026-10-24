import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';

export const userProfileKeys = {
  user: (userName: string | undefined) => ['user-profile', userName] as const,
};

export const userProfileQueryOptions = (userName: string | undefined) =>
  queryOptions({
    queryKey: userProfileKeys.user(userName),
    queryFn: async (): Promise<UserProfile | null> => {
      const r = await window.sonos.fetchUserProfile(userName!);
      return r ?? null;
    },
    enabled: !!userName,
  });

export function useUserProfile(userName: string | undefined) {
  return useQuery(userProfileQueryOptions(userName));
}

export function useInvalidateUserProfile() {
  const queryClient = useQueryClient();
  return (userName: string) => queryClient.invalidateQueries({ queryKey: userProfileKeys.user(userName) });
}
