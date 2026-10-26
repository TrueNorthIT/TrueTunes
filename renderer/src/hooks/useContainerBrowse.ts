import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/sonosApi';
import { extractItems, resolveAlbumParams } from '../lib/itemHelpers';
import { GC_HOUR } from '../lib/queryDefaults';
import { findYtmShelf } from '../lib/ytmSections';
import { homeKeys } from './useYtmHome';
import type { SonosItem } from '../types/sonos';

export const containerKeys = {
  detail: (containerId: string | undefined) => ['container', containerId] as const,
};

async function browse(containerId: string, serviceId?: string, accountId?: string, defaults?: string) {
  const r = await api.browse.container(containerId, { serviceId, accountId, defaults, muse2: true });
  if (r.error) throw new Error(r.error);
  return extractItems(r.data);
}

/**
 * Browse a container. A YouTube Music Home shelf (New releases, Quick picks, Albums for you...) is addressed by
 * a short-lived id that changes on every Home load, so a card opened from a Home that has been on screen for a
 * while comes back empty rather than failing. When that happens and we know the shelf's title, look the shelf
 * up again for a fresh id and browse that; `onRecovered` lets the caller refresh Home so its cards get fresh ids
 * too. A genuinely empty container (no shelf by that title, or the same id) stays empty.
 */
export type ShelfLookup = { title?: string; art?: string | null };

export const containerQueryOptions = (
  containerId: string | undefined,
  serviceId: string | undefined,
  accountId: string | undefined,
  defaults?: string,
  shelfLookup?: ShelfLookup,
  onRecovered?: () => void
) =>
  queryOptions({
    queryKey: containerKeys.detail(containerId),
    queryFn: async (): Promise<SonosItem[]> => {
      const items = await browse(containerId!, serviceId, accountId, defaults);
      const title = shelfLookup?.title;
      if (items.length > 0 || !title) return items;
      const shelf = await findYtmShelf(title, shelfLookup.art).catch(() => undefined);
      if (!shelf) return items;
      const p = resolveAlbumParams(shelf);
      if (!p.albumId || p.albumId === containerId) return items;
      const fresh = await browse(p.albumId, p.serviceId ?? serviceId, p.accountId ?? accountId, p.defaults).catch(
        () => [] as SonosItem[]
      );
      if (fresh.length === 0) return items;
      onRecovered?.();
      return fresh;
    },
    enabled: !!(containerId && serviceId && accountId),
    gcTime: GC_HOUR,
  });

export function useContainerBrowse(
  containerId: string | undefined,
  serviceId: string | undefined,
  accountId: string | undefined,
  defaults?: string,
  shelfLookup?: ShelfLookup
) {
  const queryClient = useQueryClient();
  return useQuery(
    containerQueryOptions(containerId, serviceId, accountId, defaults, shelfLookup, () => {
      void queryClient.invalidateQueries({ queryKey: homeKeys.ytm });
    })
  );
}
