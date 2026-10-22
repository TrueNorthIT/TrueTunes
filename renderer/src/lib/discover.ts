/** Pure helpers for the Discover page: who the set is for, and the act cards. */

import { baseTitle } from './releaseShelves';
import { norm } from './shelfSearch';

/** One song whatever the version: "Neverender (Radio Edit)", "Neverender - Remastered", "Sweet Love Ft Nazlyn" and plain titles match. */
export const songKey = (title: string) => norm(baseTitle(title).replace(/\s+(ft|feat|featuring)\.?\s.*$/, ''));

export interface ActGroup<T> {
  act: DjArtist;
  tracks: T[];
}

export interface UnheardOptions {
  /** Tracks per act. */
  perAct: number;
  /** What's in the queue now. DJ picks are queued unattributed, so they never reach the history. */
  queued?: { title: string; artist: string }[];
  /** Which window of each act's pool to show: 0 is the top, 1 the next `perAct`, wrapping round. */
  round?: number;
}

/**
 * Each act's songs the office has never played and that aren't queued, in the acts' rank order. A song
 * appears once on the page: the first (highest-ranked) act to offer it keeps it, so a collaboration
 * isn't repeated under each of its artists. Acts with nothing left are dropped. `songs[i]` is the
 * browse result for `acts[i]`.
 */
export function groupUnheard<T extends { title: string }>(
  acts: DjArtist[],
  songs: (T[] | undefined)[],
  { perAct, queued = [], round = 0 }: UnheardOptions,
): ActGroup<T>[] {
  const taken = new Set<string>();
  return acts.flatMap((act, i) => {
    // heardTrackKeys are "title||credited artist" for this act's played tracks; the title is enough here.
    const heard = new Set(act.heardTrackKeys.map((k) => songKey(k.split('||')[0])));
    const actName = norm(act.artist);
    // Queue items often carry no artist (the sidebar resolves it separately); without one, the title has to do.
    for (const q of queued) if (!q.artist.trim() || norm(q.artist).includes(actName)) heard.add(songKey(q.title));
    const pool = (songs[i] ?? []).filter((t) => {
      const key = songKey(t.title);
      if (heard.has(key) || taken.has(key)) return false;
      taken.add(key);
      return true;
    });
    if (!pool.length) return [];
    const start = pool.length > perAct ? (round * perAct) % pool.length : 0;
    const tracks = Array.from({ length: Math.min(perAct, pool.length) }, (_, j) => pool[(start + j) % pool.length]);
    return [{ act, tracks }];
  });
}

/** One track per act in rank order, then round again, so a flat list doesn't clump by artist. */
export function interleave<T>(groups: ActGroup<T>[], max: number): { act: DjArtist; track: T }[] {
  const out: { act: DjArtist; track: T }[] = [];
  const rounds = Math.max(0, ...groups.map((g) => g.tracks.length));
  for (let r = 0; r < rounds && out.length < max; r++) {
    for (const g of groups) {
      if (out.length >= max) break;
      if (g.tracks[r]) out.push({ act: g.act, track: g.tracks[r] });
    }
  }
  return out;
}

/**
 * The people driving an act, from the server's "Rich, Alex and Sam queue Muse": "Rich, Alex and Sam".
 * The viewer reads as "You". Anything that isn't a fan credit ("Popular with the office") passes through.
 */
export function actDrivers(because: string, artist: string, viewer?: string | null): string {
  const m = because.match(new RegExp(`^(.+) queues? ${artist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
  if (!m) return because;
  if (!viewer) return m[1];
  return m[1]
    .split(/(, | and )/)
    .map((part) => (part === viewer ? 'You' : part))
    .join('');
}

export type RoomBasis = 'chosen' | 'presence' | 'queueing' | 'everyone';

/**
 * Who the set is for, and everyone else. A hand-picked selection wins, then whoever presence puts in
 * the office, then whoever the server saw queueing today. With none of those it's the whole office,
 * and nobody is "away".
 */
export function splitRoom<U extends { userId: string }>(
  users: U[],
  { selected, inOffice, listeners }: { selected: string[]; inOffice: string[]; listeners: string[] },
): { present: U[]; away: U[]; basis: RoomBasis } {
  const [ids, basis]: [string[], RoomBasis] = selected.length
    ? [selected, 'chosen']
    : inOffice.length
      ? [inOffice, 'presence']
      : listeners.length
        ? [listeners, 'queueing']
        : [[], 'everyone'];
  if (basis === 'everyone') return { present: users, away: [], basis };
  const set = new Set(ids);
  return { present: users.filter((u) => set.has(u.userId)), away: users.filter((u) => !set.has(u.userId)), basis };
}
