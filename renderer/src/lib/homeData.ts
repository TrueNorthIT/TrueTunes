import { artistItem } from './itemHelpers';
import type { SonosItem } from '../types/sonos';

// Pure data helpers behind the Home page.

const CREDIT_SEPARATOR = /\s*,\s*|\s*&\s*|\s+(?:feat\.?|ft\.?|featuring)\s+|\s+x\s+/i;

/** First name in a multi-artist credit ("A, B", "A & B", "A feat. B", "A x B"). Never splits on "and". */
export function primaryArtistName(credit: string): string {
  return credit.trim().split(CREDIT_SEPARATOR)[0].trim();
}

/** One entry per primary artist name (case-insensitive), first occurrence wins, artist rewritten to the primary name. */
export function dedupeArtists<T extends { artist: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const name = primaryArtistName(item.artist);
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...item, artist: name });
  }
  return out;
}

/** Accepts a StatsTrack or a RecentTrack. Null when there is no uri to queue. */
export function statsTrackToItem(t: Omit<StatsTrack, 'count'> & { count?: number }): SonosItem | null {
  if (!t.uri) return null;
  return {
    type: 'TRACK',
    title: t.trackName,
    artist: t.artist,
    imageUrl: t.imageUrl,
    resource: {
      type: 'TRACK',
      id: { objectId: t.uri, serviceId: t.serviceId ?? '', accountId: t.accountId ?? '' },
    },
  };
}

export function statsArtistToItem(a: StatsArtist): SonosItem {
  return artistItem(
    a.artist,
    { objectId: a.artistId, serviceId: a.serviceId, accountId: a.accountId },
    { title: a.artist, imageUrl: a.imageUrl }
  );
}

export function statsAlbumToItem(a: StatsAlbum): SonosItem {
  return {
    type: 'ITEM_ALBUM',
    title: a.album,
    name: a.album,
    artist: a.artist,
    imageUrl: a.imageUrl,
    id: { objectId: a.albumId, serviceId: a.serviceId, accountId: a.accountId },
    summary: { content: a.artist },
  };
}

/** Each person's newest distinct tracks, in the order of `people`. People without tracks are skipped and don't use up a slot. */
export function picksByPerson(
  people: string[],
  byUser: Map<string, RecentTrack[]>,
  opts: { perPerson?: number; maxPeople?: number } = {}
): { user: string; tracks: RecentTrack[] }[] {
  const { perPerson = 3, maxPeople = 6 } = opts;
  const out: { user: string; tracks: RecentTrack[] }[] = [];
  for (const user of people) {
    if (out.length >= maxPeople) break;
    const seen = new Set<string>();
    const tracks = [...(byUser.get(user) ?? [])]
      .sort((a, b) => b.lastPlayed - a.lastPlayed)
      .filter((t) => {
        const key = t.uri || `${t.trackName.toLowerCase()}|${t.artist.toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, perPerson);
    if (tracks.length) out.push({ user, tracks });
  }
  return out;
}

/** Alternate album, artist, album, ... then the remainder of whichever list is longer. */
export function jumpBackIn<T>(albums: T[], artists: T[], max = 12): { kind: 'album' | 'artist'; item: T }[] {
  const out: { kind: 'album' | 'artist'; item: T }[] = [];
  for (let i = 0; out.length < max && (i < albums.length || i < artists.length); i++) {
    if (i < albums.length) out.push({ kind: 'album', item: albums[i] });
    if (out.length < max && i < artists.length) out.push({ kind: 'artist', item: artists[i] });
  }
  return out;
}

/** Keep at most `max` tracks per primary artist (case-insensitive), preserving order. */
export function capPerArtist<T extends { artist: string }>(tracks: T[], max: number): T[] {
  const counts = new Map<string, number>();
  return tracks.filter((t) => {
    const key = primaryArtistName(t.artist).toLowerCase();
    const n = counts.get(key) ?? 0;
    counts.set(key, n + 1);
    return n < max;
  });
}

/** "Today", "Yesterday", "3 days ago", "1 week ago"... for a last-played timestamp. */
export function relativeDay(ts: number, now = Date.now()): string {
  const days = Math.floor((now - ts) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return '1 week ago';
  return `${Math.floor(days / 7)} weeks ago`;
}

function domText(node: GeniusDomNode): string {
  if (typeof node === 'string') return node;
  if (node.tag === 'br') return ' ';
  // A list reads as one line, its items comma-separated (Genius bios list band members).
  if (node.tag === 'ul' || node.tag === 'ol')
    return (node.children ?? [])
      .map((c) => domText(c).trim())
      .filter(Boolean)
      .join(', ');
  return (node.children ?? []).map(domText).join('');
}

/** Plain text of each non-empty paragraph (top-level block) of a Genius description. */
export function geniusParagraphs(node: GeniusDomNode | null | undefined): string[] {
  // Genius returns "?" as the description of songs nobody has written about yet.
  const real = (t: string) => (t && t !== '?' ? t : '');
  if (!node || typeof node === 'string') return [real((node ?? '').trim())].filter(Boolean);
  const paras = node.tag === 'p' ? [node] : (node.children ?? []);
  return paras.map((p) => real(domText(p).replace(/\s+/g, ' ').trim())).filter(Boolean);
}

/** Plain text of the first non-empty paragraph of a Genius description, or '' when there is none. */
export function geniusFirstParagraph(node: GeniusDomNode | null | undefined): string {
  return geniusParagraphs(node)[0] ?? '';
}

/**
 * "Rich and Alex queue Gorillaz — never played here" becomes "Rich & Alex love Gorillaz". The viewer becomes "You".
 * With `fans` (each person's all-time queues of the artist) the verb follows the evidence, judged by the lowest count
 * among the people named, so it is true of all of them: 5+ "love", 2–4 "like", 1 "have played".
 */
export function pickReason(because: string, viewer?: string | null, fans?: { user: string; count: number }[]): string {
  const [lead] = because.split(' — ');
  const m = lead.match(/^(.*?)\s(queues?)\s(.*)$/);
  if (!m) return lead;
  const names = m[1].split(/,\s*|\s+and\s+/).filter(Boolean);
  const mine = !!viewer && names.includes(viewer);
  const parts = mine ? ['You', ...names.filter((n) => n !== viewer)] : names;
  const subject =
    parts.length > 2 ? `${parts.slice(0, -1).join(', ')} & ${parts[parts.length - 1]}` : parts.join(' & ');
  const plural = mine || parts.length > 1 || m[2] === 'queue';
  const counts = names.flatMap((n) => fans?.find((f) => f.user === n)?.count ?? []);
  const least = counts.length ? Math.min(...counts) : Infinity;
  const verb =
    least >= 5
      ? plural
        ? 'love'
        : 'loves'
      : least >= 2
        ? plural
          ? 'like'
          : 'likes'
        : plural
          ? 'have played'
          : 'has played';
  return `${subject} ${verb} ${m[3]}`;
}

/** The small muted tag for compact rows: only "Never played here", nothing else. */
export function neverPlayedTag(because: string): string | null {
  return /never played here/i.test(because) ? 'Never played here' : null;
}

const contentKey = (title?: string | null, artist?: string | null) =>
  `${(title ?? '').trim().toLowerCase()}|${(artist ?? '').trim().toLowerCase()}`;

/**
 * Queue positions to remove to undo a batch of adds. Matches by id, or by title and artist
 * (Sonos re-keys a lone track once it lands), and for each track removes only the newest copies,
 * so an earlier copy somebody else queued is never touched.
 */
export function indicesToUndo(
  queue: { track: { id: string; title: string; artist: string } }[],
  added: { id: string; title: string; artist: string }[]
): number[] {
  const wanted = new Map<string, { id: string; count: number }>();
  for (const a of added) {
    const k = contentKey(a.title, a.artist);
    const w = wanted.get(k);
    if (w) w.count += 1;
    else wanted.set(k, { id: a.id, count: 1 });
  }
  const out: number[] = [];
  for (const [k, { id, count }] of wanted) {
    const hits = queue.flatMap((q, i) =>
      q.track.id === id || contentKey(q.track.title, q.track.artist) === k ? [i] : []
    );
    out.push(...hits.slice(-count));
  }
  return out.sort((x, y) => x - y);
}

/** "12 queued". */
export const queued = (n: number) => `${n.toLocaleString()} queued`;
