import { queryOptions, useQuery } from '@tanstack/react-query';

export const usersKeys = {
  // Keyed on includeSelf — otherwise the "everyone else" list served to
  // HomePanel would be handed to callers that need the whole room.
  list: (includeSelf: boolean) => ['users', includeSelf] as const,
};

export const usersQueryOptions = (includeSelf = false) =>
  queryOptions({
    queryKey: usersKeys.list(includeSelf),
    queryFn: (): Promise<UserSummary[]> => window.sonos.fetchUsers(includeSelf),
  });

export function useUsers(enabled = true, includeSelf = false) {
  return useQuery({ ...usersQueryOptions(includeSelf), enabled });
}
