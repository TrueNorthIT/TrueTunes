import { norm } from './shelfSearch';
import { getName, isAlbum, isArtist, isTrack } from './itemHelpers';
import type { SonosItem } from '../types/sonos';

/** norm() plus no punctuation: "Mr. Brightside" and "mr brightside" are one title. */
function key(s: string): string {
  return norm(s).replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
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
 * else the service's first track. Only the top artist counts: for "Mr Brightside" the service ranks The Killers first
 * and a tribute act actually called Mr. Brightside third, and the song is what was meant.
 */
export function pickTopResult(items: SonosItem[], query: string): SonosItem | null {
  const q = key(query);
  if (!q) return null;
  const tracks = items.filter(isTrack);
  return (
    bestMatch(items.filter(isArtist).slice(0, 1), q) ??
    bestMatch(tracks.filter((t) => albumNameOf(t)), q) ??
    bestMatch(items.filter(isAlbum), q) ??
    tracks[0] ??
    items[0] ??
    null
  );
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
