/** Pure helpers for the Discover page: who the set is for, and the act cards. */

/** Same key shape the server builds `heardTrackKeys` from. */
const trackKey = (title: string, artist: string) => `${title}||${artist}`;

export interface ActGroup<T> {
  act: DjArtist;
  tracks: T[];
}

/**
 * Each act's tracks the office has never played, capped per act, in the acts' rank order.
 * Acts with nothing unheard are dropped. `songs[i]` is the browse result for `acts[i]`.
 */
export function groupUnheard<T extends { title: string; artists?: string[] }>(
  acts: DjArtist[],
  songs: (T[] | undefined)[],
  perAct: number,
): ActGroup<T>[] {
  return acts.flatMap((act, i) => {
    const heard = new Set(act.heardTrackKeys);
    const tracks = (songs[i] ?? [])
      .filter((t) => !heard.has(trackKey(t.title, t.artists?.[0] ?? act.artist)) && !heard.has(trackKey(t.title, act.artist)))
      .slice(0, perAct);
    return tracks.length ? [{ act, tracks }] : [];
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
