import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/sonosApi';
import { extractItems } from '../lib/itemHelpers';
import type { SonosItem } from '../types/sonos';

export function useContainerBrowse(
  containerId: string | undefined,
  serviceId:   string | undefined,
  accountId:   string | undefined,
  defaults?:   string,
) {
  return useQuery<SonosItem[]>({
    queryKey: ['container', containerId] as const,
    queryFn: async () => {
      const r = await api.browse.container(containerId!, { serviceId, accountId, defaults, muse2: true });
      if (r.error) throw new Error(r.error);
      return extractItems(r.data);
    },
    enabled: !!(containerId && serviceId && accountId),
    staleTime: 5 * 60 * 1000,
    gcTime:    60 * 60 * 1000,
  });
}
