import { queryOptions, useQuery } from '@tanstack/react-query';
import { fetchYtmSections } from '../components/HomePanel';

export const homeKeys = {
  ytm: ['ytm-home'] as const,
};

export const ytmHomeQueryOptions = () =>
  queryOptions({
    queryKey: homeKeys.ytm,
    queryFn: fetchYtmSections,
  });

export function useYtmHome(enabled: boolean) {
  return useQuery({ ...ytmHomeQueryOptions(), enabled });
}
