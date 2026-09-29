// Ported from desktop HomePanel.fetchYtmSections: the YouTube Music home shelves via muse2 browse.
import type { SonosItem, SonosItemId } from '../types/sonos';
import { extractItems } from './itemHelpers';
import { api } from './sonosApi';

export interface YtmSections {
  forYou: SonosItem[];
  newReleases: SonosItem[];
  charts: SonosItem[];
}

const EMPTY: YtmSections = { forYou: [], newReleases: [], charts: [] };

async function browseContainer(item: SonosItem | undefined): Promise<SonosItem[]> {
  if (!item) return [];
  const rid = item.resource?.id as SonosItemId | undefined;
  if (!rid?.objectId) return [];
  const r = await api.browse.container(rid.objectId, {
    serviceId: rid.serviceId,
    accountId: rid.accountId,
    defaults: item.resource?.defaults as string | undefined,
    muse2: true,
  });
  if (r.error) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[ytm] container browse failed:', rid.objectId, r.error);
    return [];
  }
  return extractItems(r.data);
}

export async function fetchYtmSections(): Promise<YtmSections> {
  const rootR = await api.browse.container('root', { muse2: true });
  if (rootR.error) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[ytm] root browse failed:', rootR.error);
    return { ...EMPTY };
  }

  const d = rootR.data as Record<string, unknown>;
  const stack = ((d['sections'] as Record<string, unknown> | undefined)?.['items'] as unknown[] | undefined)?.[0] as
    | Record<string, unknown>
    | undefined;
  const rootItems = (stack?.['items'] ?? []) as SonosItem[];
  const find = (title: string) => rootItems.find((i) => (i.title ?? i.name) === title);

  // Home is the container that carries the shelves.
  const homeItem = find('Home');
  const homeItems = await browseContainer(homeItem);
  const findShelf = (...titles: string[]) => {
    for (const t of titles) {
      const hit = homeItems.find((i) => (i.title ?? i.name) === t);
      if (hit) return hit;
    }
    return undefined;
  };

  // Desktop reads 'New releases' / 'Charts' from the root. Some accounts (this one included) only
  // expose Home / Library / My Supermix there, with those shelves inside Home instead, so fall back.
  const [newItems, chartItems] = await Promise.all([
    browseContainer(find('New releases') ?? findShelf('New releases', 'Fresh new music')),
    browseContainer(find('Charts') ?? findShelf('Top songs', 'Trending songs for you')),
  ]);

  const supermix = find('My Supermix');
  return {
    // Desktop swapped in the app icon for the Supermix tile; here it keeps whatever art Sonos gave it.
    forYou: supermix ? [supermix, ...homeItems] : homeItems,
    newReleases: newItems,
    charts: chartItems,
  };
}
