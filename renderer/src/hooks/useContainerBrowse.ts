import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/sonosApi';
import { extractItems, resolveAlbumParams } from '../lib/itemHelpers';
import { GC_HOUR } from '../lib/queryDefaults';
import { lookupYtmShelf, ShelfGoneError, type YtmShelfLookup } from '../lib/ytmSections';
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
 * up again for a fresh id and browse that. If Home no longer carries the shelf at all, fail with ShelfGoneError.
 * Either way `onHomeStale` lets the caller refresh Home quietly, so its cards get fresh ids too. A genuinely
 * empty container (the same id, an empty fresh shelf, or a lookup that couldn't tell) stays empty.
 */
export type ShelfLookup = { title?: string; art?: string | null };

export const containerQueryOptions = (
  containerId: string | undefined,
  serviceId: string | undefined,
  accountId: string | undefined,
  defaults?: string,
  shelfLookup?: ShelfLookup,
  onHomeStale?: () => void
) =>
  queryOptions({
    queryKey: containerKeys.detail(containerId),
    queryFn: async (): Promise<SonosItem[]> => {
      const items = await browse(containerId!, serviceId, accountId, defaults);
      const title = shelfLookup?.title;
      if (items.length > 0 || !title) return items;
      const found: YtmShelfLookup = await lookupYtmShelf(title, shelfLookup.art, serviceId).catch(() => ({
        kind: 'unknown' as const,
      }));
      if (found.kind === 'gone') {
        onHomeStale?.();
        throw new ShelfGoneError(title);
      }
      if (found.kind === 'unknown') return items;
      const p = resolveAlbumParams(found.shelf);
      if (!p.albumId || p.albumId === containerId) return items;
      const fresh = await browse(p.albumId, p.serviceId ?? serviceId, p.accountId ?? accountId, p.defaults).catch(
        () => [] as SonosItem[]
      );
      if (fresh.length === 0) return items;
      onHomeStale?.();
      return fresh;
    },
    // The app default (one retry), except that a vanished shelf won't come back on a retry: say so straight away.
    retry: (failures, error) => !(error instanceof ShelfGoneError) && failures < 1,
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
      // A background refetch: Home keeps what it shows (isLoading stays false) and merges the fresh ids in.
      void queryClient.invalidateQueries({ queryKey: homeKeys.ytm });
    })
  );
}
