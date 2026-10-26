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

/** Browse a root entry or Home shelf by its own id and defaults. Null on error or when it has no id. */
async function browseYtmItemOrNull(item: SonosItem | undefined): Promise<SonosItem[] | null> {
  if (!item) return null;
  const rid = item.resource?.id as SonosItemId | undefined;
  const id = rid?.objectId;
  if (!id) return null;
  const r = await api.browse.container(id, {
    serviceId: rid?.serviceId,
    accountId: rid?.accountId,
    defaults: item.resource?.defaults as string | undefined,
    muse2: true,
  });
  return r.error ? null : extractItems(r.data);
}

/** Browse a root entry or Home shelf by its own id and defaults. Empty on error or when it has no id. */
export async function browseYtmItem(item: SonosItem | undefined): Promise<SonosItem[]> {
  return (await browseYtmItemOrNull(item)) ?? [];
}

/**
 * A Home shelf whose card was opened after YouTube Music dropped it from Home altogether: its old id comes back
 * empty and there's no shelf by that title any more. The page says so, kindly, rather than "nothing here".
 */
export class ShelfGoneError extends Error {
  constructor(title: string) {
    super(`${title} is no longer on Home`);
    this.name = 'ShelfGoneError';
  }
}

/**
 * The result of looking a Home shelf up again: `found` with the fresh shelf, `gone` when YouTube Music's root and
 * Home no longer carry a shelf by that title (some drop off Home within minutes), or `unknown` when we can't
 * tell (the root browse failed, or the container isn't one of YouTube Music's).
 */
export type YtmShelfLookup = { kind: 'found'; shelf: SonosItem } | { kind: 'gone' } | { kind: 'unknown' };

/**
 * Look a Home shelf (or root entry) up again by its title, for a fresh container id. YouTube Music's shelf ids
 * are short-lived tokens that change on every Home load: one handed out with Home browses fine for a few
 * minutes, then comes back as an empty section rather than an error. The root is checked first (some accounts
 * list New releases there), then inside Home.
 *
 * Home can carry several shelves with one title (three "Top songs", one per chart). Their artwork is what tells
 * them apart and it survives a reload, so when `art` is given it picks between same-titled shelves.
 *
 * `serviceId` is the container's own service: a miss only counts as `gone` when the root belongs to that
 * service, so an empty container from somewhere else is never mistaken for a vanished Home shelf.
 */
export async function lookupYtmShelf(title: string, art?: string | null, serviceId?: string): Promise<YtmShelfLookup> {
  const pick = (items: SonosItem[]) => {
    const hits = items.filter((i) => titleOf(i) === title);
    return (hits.length > 1 && art ? hits.find((i) => getItemArt(i) === art) : undefined) ?? hits[0];
  };
  const rootItems = await fetchYtmRootItems();
  if (!rootItems) return { kind: 'unknown' };
  const atRoot = pick(rootItems);
  if (atRoot) return { kind: 'found', shelf: atRoot };
  const homeItem = rootItems.find((i) => titleOf(i) === 'Home');
  const homeItems = await browseYtmItemOrNull(homeItem);
  if (!homeItems) return { kind: 'unknown' }; // no Home, or it failed to load: can't say the shelf has gone
  const inHome = pick(homeItems);
  if (inHome) return { kind: 'found', shelf: inHome };
  const rootService = (homeItem?.resource?.id as SonosItemId | undefined)?.serviceId;
  return !serviceId || rootService === serviceId ? { kind: 'gone' } : { kind: 'unknown' };
}

/**
 * Merge a fresh load of Home's "For you" cards into the ones on screen without moving anything. Each card on
 * screen keeps its place and takes the fresh card it matches (and with it the fresh, working id): by title and
 * artwork first, then by title alone (My Supermix borrows its first track's artwork, which changes between
 * loads). A card with no fresh match has dropped off Home: it stays put, so nothing vanishes in front of the
 * user, and goes at the next natural refresh (Home mounting again). Fresh cards with no match on screen go on
 * the end, after everything already visible.
 */
export function mergeShelves(shown: SonosItem[], fresh: SonosItem[]): SonosItem[] {
  const used = new Set<number>();
  const take = (match: (f: SonosItem) => boolean): SonosItem | undefined => {
    const i = fresh.findIndex((f, j) => !used.has(j) && match(f));
    if (i < 0) return undefined;
    used.add(i);
    return fresh[i];
  };
  const merged: (SonosItem | undefined)[] = shown.map((s) =>
    take((f) => titleOf(f) === titleOf(s) && getItemArt(f) === getItemArt(s))
  );
  shown.forEach((s, i) => {
    merged[i] ??= take((f) => titleOf(f) === titleOf(s)) ?? s;
  });
  return [...(merged as SonosItem[]), ...fresh.filter((_, j) => !used.has(j))];
}
