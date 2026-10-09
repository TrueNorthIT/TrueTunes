import { useQueries } from '@tanstack/react-query';
import { artistQueryOptions } from './useArtistBrowse';
import type { AlbumTrack } from './useAlbumBrowse';

export interface DjDiscovery {
  track: AlbumTrack;
  artist: string;
  because: string;
  score: number;
}

/**
 * Caps on what comes back. Each act's "Top Songs" browse returns dozens, and a
 * dozen acts unbounded produced ~800 rows — a wall nobody reads, and a wall
 * that made the good suggestions at the top indistinguishable from the tail.
 */
const MAX_DISCOVERIES = 30;
const MAX_PER_ARTIST = 3;

/** Same key shape the server builds `heardTrackKeys` from. */
function trackKey(title: string, artist: string): string {
  return `${title}||${artist}`;
}

/**
 * Music by the office's favourite acts that the office has never actually played.
 *
 * The event corpus can't supply this. One speaker means everything in it has
 * already been heard by whoever was in the room, so "new" has to come from the
 * music service itself: browse each ranked act, then subtract what the history
 * already contains.
 *
 * Runs one browse per act, which is why the server caps how many it returns.
 * They're ordinary React Query calls, so the cache is shared with the artist
 * pages and a second visit costs nothing.
 */
export function useDjDiscoveries(artists: DjArtist[] | undefined, enabled = true) {
  const acts = (artists ?? []).filter((a) => a.artistId && a.serviceId && a.accountId);

  const results = useQueries({
    queries: acts.map((act) => ({
      ...artistQueryOptions(act.artistId, act.serviceId, act.accountId, undefined, act.artist),
      enabled,
      staleTime: 30 * 60_000,
    })),
  });

  const isLoading = enabled && results.some((r) => r.isLoading);

  // Interleave: one unheard track per act in rank order, then go round again.
  // Taking each act's tracks consecutively would clump the set by artist.
  const pools = acts.map((act, i) => {
    const heard = new Set(act.heardTrackKeys);
    const topSongs = results[i]?.data?.topSongs ?? [];
    return {
      act,
      tracks: topSongs.filter((t) => {
        const credited = t.artists?.[0] ?? act.artist;
        return !heard.has(trackKey(t.title, credited)) && !heard.has(trackKey(t.title, act.artist));
      }),
    };
  });

  const discoveries: DjDiscovery[] = [];
  for (let round = 0; round < MAX_PER_ARTIST; round++) {
    for (const pool of pools) {
      if (discoveries.length >= MAX_DISCOVERIES) break;
      const track = pool.tracks[round];
      if (!track) continue;
      discoveries.push({
        track,
        artist: pool.act.artist,
        because: `${pool.act.because} — never played here`,
        score: pool.act.score,
      });
    }
    if (discoveries.length >= MAX_DISCOVERIES) break;
  }

  return { discoveries, isLoading };
}
