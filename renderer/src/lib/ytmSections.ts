import { api } from './sonosApi';
import { extractItems, getItemArt } from './itemHelpers';
import type { SonosItem, SonosItemId } from '../types/sonos';

const titleOf = (i: SonosItem) => i.title ?? i.name;

/**
 * The YouTube Music (muse2) root's items: Home, Library, My Supermix and, on some accounts, New releases and
 * Charts. Null when the root browse fails.
 */
export async function fetchYtmRootItems(): Promise<SonosItem[] | null> {
  const r = await api.browse.container('root', { muse2: true });
  if (r.error) return null;
  const d = r.data ?? {};
  const stack = ((d['sections'] as Record<string, unknown>)?.['items'] as unknown[])?.[0] as
    | Record<string, unknown>
    | undefined;
  return (stack?.['items'] ?? []) as SonosItem[];
}

/** Browse a root entry or Home shelf by its own id and defaults. Empty on error or when it has no id. */
export async function browseYtmItem(item: SonosItem | undefined): Promise<SonosItem[]> {
  if (!item) return [];
  const rid = item.resource?.id as SonosItemId | undefined;
  const id = rid?.objectId;
  if (!id) return [];
  const r = await api.browse.container(id, {
    serviceId: rid?.serviceId,
    accountId: rid?.accountId,
    defaults: item.resource?.defaults as string | undefined,
    muse2: true,
  });
  return r.error ? [] : extractItems(r.data);
}

/**
 * Look a Home shelf (or root entry) up again by its title, for a fresh container id. YouTube Music's shelf ids
 * are short-lived tokens that change on every Home load: one handed out with Home browses fine for a few
 * minutes, then comes back as an empty section rather than an error. The root is checked first (some accounts
 * list New releases there), then inside Home.
 *
 * Home can carry several shelves with one title (three "Top songs", one per chart). Their artwork is what tells
 * them apart and it survives a reload, so when `art` is given it picks between same-titled shelves.
 */
export async function findYtmShelf(title: string, art?: string | null): Promise<SonosItem | undefined> {
  const pick = (items: SonosItem[]) => {
    const hits = items.filter((i) => titleOf(i) === title);
    return (hits.length > 1 && art ? hits.find((i) => getItemArt(i) === art) : undefined) ?? hits[0];
  };
  const rootItems = await fetchYtmRootItems();
  if (!rootItems) return undefined;
  const atRoot = pick(rootItems);
  if (atRoot) return atRoot;
  return pick(await browseYtmItem(rootItems.find((i) => titleOf(i) === 'Home')));
}
