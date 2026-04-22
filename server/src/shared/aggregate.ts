export interface RawEvent {
  userId: string;
  trackName: string;
  artist: string;
  artistId?: string | null;
  album?: string | null;
  albumId?: string | null;
  imageUrl?: string | null;
  uri?: string | null;
}

export type ItemCategory = 'track' | 'artist' | 'album';

export interface TrackEntry {
  key: string;
  trackName: string;
  artist: string;
  artistId?: string;
  album?: string;
  albumId?: string;
  imageUrl?: string;
  uri?: string;
  count: number;
}

export interface ArtistEntry {
  artist: string;
  artistId?: string;
  imageUrl?: string;
  count: number;
}

export interface AlbumEntry {
  key: string;
  album: string;
  artist: string;
  artistId?: string;
  albumId?: string;
  imageUrl?: string;
  count: number;
}

export interface AggregateResult {
  trackMap: Record<string, TrackEntry>;
  artistMap: Record<string, ArtistEntry>;
  albumMap: Record<string, AlbumEntry>;
  userCounts: Record<string, number>;
  queuersByItem: Record<string, Record<string, number>>;
}

export function itemKey(category: ItemCategory, id: string): string {
  return `${category}:${id}`;
}

function trackKeyFor(e: RawEvent): string {
  return `${e.trackName}||${e.artist}`;
}

function albumKeyFor(e: RawEvent): string | null {
  if (!e.album) return null;
  return e.albumId ?? e.album;
}

function artistKeyFor(e: RawEvent): string | null {
  if (!e.artist) return null;
  return e.artist;
}

function bumpQueuer(
  queuersByItem: Record<string, Record<string, number>>,
  key: string,
  userId: string,
): void {
  if (!queuersByItem[key]) queuersByItem[key] = {};
  queuersByItem[key][userId] = (queuersByItem[key][userId] ?? 0) + 1;
}

export function aggregateEvents(events: RawEvent[]): AggregateResult {
  const trackMap: Record<string, TrackEntry> = {};
  const artistMap: Record<string, ArtistEntry> = {};
  const albumMap: Record<string, AlbumEntry> = {};
  const userCounts: Record<string, number> = {};
  const queuersByItem: Record<string, Record<string, number>> = {};

  for (const e of events) {
    if (e.userId) userCounts[e.userId] = (userCounts[e.userId] ?? 0) + 1;

    const aKey = artistKeyFor(e);
    if (aKey) {
      if (!artistMap[aKey]) {
        artistMap[aKey] = {
          artist: e.artist,
          artistId: e.artistId ?? undefined,
          imageUrl: e.imageUrl ?? undefined,
          count: 0,
        };
      } else {
        if (!artistMap[aKey].artistId && e.artistId) artistMap[aKey].artistId = e.artistId;
        if (!artistMap[aKey].imageUrl && e.imageUrl) artistMap[aKey].imageUrl = e.imageUrl;
      }
      artistMap[aKey].count++;
      if (e.userId) bumpQueuer(queuersByItem, itemKey('artist', aKey), e.userId);
    }

    const albumKey = albumKeyFor(e);
    if (e.album && albumKey) {
      if (!albumMap[albumKey]) {
        albumMap[albumKey] = {
          key: albumKey,
          album: e.album,
          artist: e.artist,
          artistId: e.artistId ?? undefined,
          albumId: e.albumId ?? undefined,
          imageUrl: e.imageUrl ?? undefined,
          count: 0,
        };
      } else {
        if (!albumMap[albumKey].albumId && e.albumId) albumMap[albumKey].albumId = e.albumId;
        if (!albumMap[albumKey].artistId && e.artistId) albumMap[albumKey].artistId = e.artistId;
        if (!albumMap[albumKey].imageUrl && e.imageUrl) albumMap[albumKey].imageUrl = e.imageUrl;
      }
      albumMap[albumKey].count++;
      if (e.userId) bumpQueuer(queuersByItem, itemKey('album', albumKey), e.userId);
    }

    const tKey = trackKeyFor(e);
    if (!trackMap[tKey]) {
      trackMap[tKey] = {
        key: tKey,
        trackName: e.trackName,
        artist: e.artist,
        artistId: e.artistId ?? undefined,
        album: e.album ?? undefined,
        albumId: e.albumId ?? undefined,
        imageUrl: e.imageUrl ?? undefined,
        uri: e.uri ?? undefined,
        count: 0,
      };
    } else {
      if (!trackMap[tKey].artistId && e.artistId) trackMap[tKey].artistId = e.artistId;
      if (!trackMap[tKey].album && e.album) trackMap[tKey].album = e.album;
      if (!trackMap[tKey].albumId && e.albumId) trackMap[tKey].albumId = e.albumId;
      if (!trackMap[tKey].imageUrl && e.imageUrl) trackMap[tKey].imageUrl = e.imageUrl;
      if (!trackMap[tKey].uri && e.uri) trackMap[tKey].uri = e.uri;
    }
    trackMap[tKey].count++;
    if (e.userId) bumpQueuer(queuersByItem, itemKey('track', tKey), e.userId);
  }

  return { trackMap, artistMap, albumMap, userCounts, queuersByItem };
}
