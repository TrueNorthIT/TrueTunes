/** Pure decision logic for the Now Playing favourite heart. No React / RN imports. */

export interface FavSource {
  uri: string | null | undefined;
  trackName: string | undefined;
  artist: string | undefined;
  albumName?: string | undefined;
  imageUrl?: string | null;
  serviceId: string | null | undefined;
  accountId: string | null | undefined;
}

export type FavouriteDecision = 'noop' | 'prompt-name' | 'add' | 'remove';

export function isTrackFavourited(
  doc: { tracks: { uri: string }[] } | null | undefined,
  uri: string | null | undefined
): boolean {
  return !!(uri && doc?.tracks.some((t) => t.uri === uri));
}

/** displayName: undefined = still loading, null = unset (prompt), string = ready. */
export function decideFavourite(
  displayName: string | null | undefined,
  uri: string | null | undefined,
  isFavourited: boolean
): FavouriteDecision {
  if (displayName === undefined || !uri) return 'noop';
  if (displayName === null || displayName === '') return 'prompt-name';
  return isFavourited ? 'remove' : 'add';
}

export function buildFavouriteTrack(src: FavSource, displayName: string, now = Date.now()): PlaylistTrack {
  return {
    uri: src.uri ?? '',
    trackName: src.trackName ?? '',
    artist: src.artist ?? '',
    albumName: src.albumName,
    imageUrl: src.imageUrl ?? null,
    serviceId: src.serviceId ?? '',
    accountId: src.accountId ?? '',
    addedBy: displayName,
    addedAt: now,
  };
}

/** Returns the optimistic playlist doc after adding/removing. */
export function applyFavourite<T extends { tracks: PlaylistTrack[] }>(
  doc: T,
  action: 'add' | 'remove',
  track: PlaylistTrack
): T {
  return action === 'remove'
    ? { ...doc, tracks: doc.tracks.filter((t) => t.uri !== track.uri) }
    : { ...doc, tracks: [...doc.tracks, track] };
}
