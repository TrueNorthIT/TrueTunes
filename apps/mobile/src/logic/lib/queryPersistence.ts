// What to keep across launches. Track details (art URL, artist, album ids) never change for a
// given track, and they are what queue art is derived from, so persisting them makes the next
// launch show art immediately instead of re-fetching one Sonos request per row.

export const PERSIST_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

/** Bump to discard every previously persisted cache (e.g. if the TrackDetails shape changes). */
export const CACHE_BUSTER = 'track-details-v1';

interface DehydratableQuery {
  queryKey: readonly unknown[];
  state: { status: string };
}

/** Only successfully loaded track-detail queries; everything else (search, browse, queue) stays live. */
export function shouldPersistQuery(query: DehydratableQuery): boolean {
  return query.queryKey[0] === 'track' && typeof query.queryKey[1] === 'string' && query.state.status === 'success';
}
