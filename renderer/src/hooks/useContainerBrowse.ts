import { queryOptions, useQuery } from '@tanstack/react-query';
import { api } from '../lib/sonosApi';
import { extractItems } from '../lib/itemHelpers';
import { GC_HOUR } from '../lib/queryDefaults';

export const containerKeys = {
  detail: (containerId: string | undefined) => ['container', containerId] as const,
};

export const containerQueryOptions = (
  containerId: string | undefined,
  serviceId: string | undefined,
  accountId: string | undefined,
  defaults?: string
) =>
  queryOptions({
    queryKey: containerKeys.detail(containerId),
    queryFn: async () => {
      const r = await api.browse.container(containerId!, { serviceId, accountId, defaults, muse2: true });
      if (r.error) throw new Error(r.error);
      return extractItems(r.data);
    },
    enabled: !!(containerId && serviceId && accountId),
    gcTime: GC_HOUR,
  });

export function useContainerBrowse(
  containerId: string | undefined,
  serviceId: string | undefined,
  accountId: string | undefined,
  defaults?: string
) {
  return useQuery(containerQueryOptions(containerId, serviceId, accountId, defaults));
}
