import { useQueries } from '@tanstack/react-query';
import { artistQueryOptions } from './useArtistBrowse';
import type { AlbumTrack } from './useAlbumBrowse';
import { groupUnheard, interleave, type UnheardOptions } from '../lib/discover';
import { STALE } from '../lib/queryDefaults';

export interface DjDiscovery {
  track: AlbumTrack;
  artist: string;
  because: string;
  score: number;
  fans?: DjArtist['fans'];
}

/** One act and its tracks the office has never played. `imageUrl` is the act's photo, when the browse has one. */
export interface DjActDiscoveries {
  act: DjArtist;
  tracks: AlbumTrack[];
  imageUrl: string | null;
}

/**
 * Caps on what comes back. Each act's "Top Songs" browse returns dozens, and a
 * dozen acts unbounded produced ~800 rows — a wall nobody reads, and a wall
 * that made the good suggestions at the top indistinguishable from the tail.
 */
const MAX_DISCOVERIES = 30;
const MAX_PER_ARTIST = 3;

/**
 * Music by the office's favourite acts that the office has never actually played.
 *
 * The event corpus can't supply this. One speaker means everything in it has
 * already been heard by whoever was in the room, so "new" has to come from the
 * music service itself: browse each ranked act, then subtract what the history
 * already contains.
 *
 * `groups` keeps each act's tracks together (Discover's act cards); `discoveries`
 * is the same tracks interleaved one per act per round (Home's picks), capped at 30.
 * Pass `queued` (the live queue) so nothing already waiting to play is offered, and
 * `round` to step through each act's other unheard songs.
 *
 * `isLoading` is true while any act is still being browsed; `groups` fills in as they land.
 *
 * Runs one browse per act, which is why the server caps how many it returns.
 * They're ordinary React Query calls, so the cache is shared with the artist
 * pages and a second visit costs nothing.
 */
export function useDjDiscoveries(
  artists: DjArtist[] | undefined,
  enabled = true,
  { queued, round }: Pick<UnheardOptions, 'queued' | 'round'> = {}
) {
  const acts = (artists ?? []).filter((a) => a.artistId && a.serviceId && a.accountId);

  const results = useQueries({
    queries: acts.map((act) => ({
      ...artistQueryOptions(act.artistId, act.serviceId, act.accountId, undefined, act.artist),
      enabled,
      staleTime: STALE.halfHour,
    })),
  });

  const isLoading = enabled && results.some((r) => r.isLoading);

  const groups: DjActDiscoveries[] = groupUnheard(
    acts,
    results.map((r) => r.data?.topSongs),
    {
      perAct: MAX_PER_ARTIST,
      queued,
      round,
    }
  ).map((g) => ({
    ...g,
    imageUrl: results[acts.indexOf(g.act)]?.data?.imageUrl ?? g.act.imageUrl ?? null,
  }));

  const discoveries: DjDiscovery[] = interleave(groups, MAX_DISCOVERIES).map(({ act, track }) => ({
    track,
    artist: act.artist,
    because: `${act.because} — never played here`,
    score: act.score,
    fans: act.fans,
  }));

  return { discoveries, groups, isLoading };
}
