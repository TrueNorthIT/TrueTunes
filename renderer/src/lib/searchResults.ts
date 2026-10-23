import { norm } from './shelfSearch';
import { getItemArt, getName, isAlbum, isArtist, isTrack } from './itemHelpers';
import type { SonosAlbum, SonosItem, SonosItemId } from '../types/sonos';
import type { AlbumTrack } from '../hooks/useAlbumBrowse';

/** norm() plus no punctuation: "Mr. Brightside" and "mr brightside" are one title. */
function key(s: string): string {
  return norm(s)
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The album a search track is on, or undefined for a video or upload. */
export function albumNameOf(item: SonosItem): string | undefined {
  const a = item.album;
  return (typeof a === 'string' ? a : a?.name) || undefined;
}

function artistNames(item: SonosItem): string {
  return (item.artists ?? []).map((a) => a.name).join(', ');
}

/** The first item whose name equals the query, else the first that starts with it. */
function bestMatch(items: SonosItem[], q: string): SonosItem | undefined {
  return items.find((i) => key(getName(i)) === q) ?? items.find((i) => key(getName(i)).startsWith(q));
}

/**
 * What the person most likely typed, by match rather than by position (the service always lists artists first):
 * the service's top artist when it is named like the query, else a song with an album titled like it, else an album,
 * else the service's first track that shares a word with the query. Only the top artist counts: for "Mr Brightside"
 * the service ranks The Killers first and a tribute act actually called Mr. Brightside third, and the song is what was
 * meant. With nothing that shares a word, there is no top result: the service always returns something, and for
 * "zxqvbnmlkjhg" that was a kids' video one click from the office speakers.
 */
export function pickTopResult(items: SonosItem[], query: string): SonosItem | null {
  const q = key(query);
  if (!q) return null;
  const tracks = items.filter(isTrack);
  return (
    bestMatch(items.filter(isArtist).slice(0, 1), q) ??
    bestMatch(
      tracks.filter((t) => albumNameOf(t)),
      q
    ) ??
    bestMatch(items.filter(isAlbum), q) ??
    tracks.find((t) => sharesWord(t, q)) ??
    items.find((i) => sharesWord(i, q)) ??
    null
  );
}

/** Words too common to mean a match on their own. */
const FILLER = new Set(['the', 'and', 'for', 'you', 'feat', 'ft']);
const words = (s: string) => s.split(' ').filter((w) => w.length > 1 && !FILLER.has(w));

/** Whether the item's name (or a track's artists) shares a real word with the query (already key()ed). */
function sharesWord(item: SonosItem, q: string): boolean {
  const qs = new Set(words(q));
  return words(key(`${getName(item)} ${artistNames(item)}`)).some((w) => qs.has(w));
}

/** Drops repeat tracks (same title, artist and album); everything else passes through. */
export function dedupeTracks(items: SonosItem[]): SonosItem[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    if (!isTrack(i)) return true;
    const k = [getName(i), artistNames(i), albumNameOf(i) ?? ''].map(key).join('|');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** "Album · Arctic Monkeys", or just "Album" when the artist is already the top result. */
export function albumSub(album: SonosItem, topArtist: string | null): string {
  const [kind, ...rest] = (album.summary?.content ?? '').split(' • ');
  const by = rest.join(' • ') || artistNames(album);
  const showBy = by && !(topArtist && key(by) === key(topArtist));
  return [album.summary?.content ? kind : '', showBy ? by : ''].filter(Boolean).join(' · ');
}

/** The playlist's owner, without the "Playlist •" prefix every one of them carries. */
export function playlistSub(playlist: SonosItem): string | null {
  const s = playlist.summary?.content;
  return s ? s.replace(/^Playlist\s*•\s*/, '') : null;
}

/** One song row, whichever list it came from: the search's tracks or the top artist's own top songs. */
export interface SongRow {
  key: string;
  /** What add, drag and the queue get: the service's own item. */
  item: SonosItem;
  id: SonosItemId;
  title: string;
  artists: { name: string; id?: SonosItemId }[];
  album?: { name: string; id?: SonosItemId };
  durationMs?: number;
  imageUrl: string | null;
  explicit: boolean;
}

export function searchTrackRow(t: SonosItem): SongRow {
  const id = ((typeof t.id === 'object' ? t.id : undefined) ?? t.resource?.id ?? {}) as SonosItemId;
  const a = t.album as SonosAlbum | string | undefined;
  const albumName = albumNameOf(t);
  return {
    key: id.objectId ?? getName(t),
    item: t,
    id,
    title: getName(t),
    artists: (t.artists ?? []).map((x) => ({ name: x.name, id: x.id })),
    album: albumName ? { name: albumName, id: typeof a === 'object' ? a.id : undefined } : undefined,
    durationMs: t.durationMs || undefined,
    imageUrl: getItemArt(t),
    explicit: !!t.explicit,
  };
}

export function topSongRow(t: AlbumTrack): SongRow {
  const scope = { serviceId: t.id.serviceId, accountId: t.id.accountId };
  return {
    key: t.id.objectId ?? t.title,
    item: t.raw,
    id: t.id,
    title: t.title,
    artists: t.artistObjects?.length
      ? t.artistObjects.map((x) => ({ name: x.name, id: { objectId: x.objectId, ...scope } }))
      : t.artists.map((name) => ({ name })),
    album: t.albumName
      ? { name: t.albumName, id: t.albumId ? { objectId: t.albumId, ...scope } : undefined }
      : undefined,
    durationMs: t.durationSeconds ? t.durationSeconds * 1000 : undefined,
    imageUrl: t.artUrl,
    explicit: t.explicit,
  };
}

/** The artist's own top songs first, then the search's songs that aren't already among them (same title and artist). */
export function withTopSongs(top: SongRow[], rest: SongRow[]): SongRow[] {
  const k = (r: SongRow) => `${key(r.title)}|${key(r.artists[0]?.name ?? '')}`;
  const seen = new Set(top.map(k));
  return [...top, ...rest.filter((r) => !seen.has(k(r)))];
}
