export interface RawEvent {
  userId: string;
  /** New events tag themselves as 'track' or 'album'. Legacy events (no tag) feed every map, preserving pre-split behavior. */
  eventType?: 'track' | 'album' | null;
  trackName: string;
  artist: string;
  serviceId?: string | null;
  accountId?: string | null;
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
  serviceId?: string;
  accountId?: string;
  artistId?: string;
  album?: string;
  albumId?: string;
  imageUrl?: string;
  uri?: string;
  count: number;
}

export interface ArtistEntry {
  artist: string;
  serviceId?: string;
  accountId?: string;
  artistId?: string;
  imageUrl?: string;
  count: number;
}

export interface AlbumEntry {
  key: string;
  album: string;
  artist: string;
  serviceId?: string;
  accountId?: string;
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

/**
 * Sonos serves multi-artist tracks/albums with a single joined subtitle
 * ("Sonny Stitt, Kenny Garrett") which we publish verbatim. Splitting on
 * commas lets each contributor count as their own artist.
 *
 * Some services (notably YT Music) instead pack release metadata into the
 * subtitle — "Album, 2020", "Single, 4.2M views", "Album • Artist" — which
 * isn't an artist at all. We drop those entries entirely instead of letting
 * them become phantom "Album" / "2020" rows in topArtists.
 */
const RELEASE_TYPE_RE = /\b(Single|Album|EP|LP|Playlist|Various Artists|Compilation|Soundtrack)\b/i;
const METADATA_SEPARATOR_RE = /[•·|]/;
const VIEW_COUNT_RE = /views|plays|listeners|streams/i;

function artistKeysFor(e: RawEvent): string[] {
  if (!e.artist) return [];
  const raw = e.artist.trim();
  if (!raw) return [];

  // Release-type subtitles and view/play counts aren't artists — drop them so
  // they don't pollute topArtists at all.
  if (RELEASE_TYPE_RE.test(raw)) return [];
  if (METADATA_SEPARATOR_RE.test(raw)) return [];
  if (VIEW_COUNT_RE.test(raw)) return [];
  if (/^\d+$/.test(raw)) return [];

  // Contains digits but no separators (e.g. "blink-182", "Maroon 5") — keep as
  // a single entry, don't try to split.
  if (/\d/.test(raw)) return [raw];

  // parts is only empty when raw is nothing but separators — not a real artist.
  return raw.split(/,\s*/).map((s) => s.trim()).filter(Boolean);
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
    // eventType branching:
    //   'track'        → trackMap + artistMap + userCounts
    //   'album'        → albumMap only (no userCounts: per-track events for the same add already credited the user)
    //   undefined/null → all three maps + userCounts (legacy events; preserves pre-split behavior)
    const isTrack = e.eventType === 'track' || e.eventType == null;
    const isAlbumOnly = e.eventType === 'album' || e.eventType == null;
    const countsUser = e.eventType !== 'album';

    if (countsUser && e.userId) userCounts[e.userId] = (userCounts[e.userId] ?? 0) + 1;

    if (isTrack) {
      const aKeys = artistKeysFor(e);
      aKeys.forEach((aKey, idx) => {
        // Only the first name is the primary artist that e.artistId references.
        // The track art (e.imageUrl) goes on every artist for the row — it's
        // not their real photo but it's better than an empty placeholder until
        // we can resolve the real artist image.
        const isPrimary = idx === 0;
        if (!artistMap[aKey]) {
          artistMap[aKey] = {
            artist: aKey,
            serviceId: e.serviceId ?? undefined,
            accountId: e.accountId ?? undefined,
            artistId: isPrimary ? (e.artistId ?? undefined) : undefined,
            imageUrl: e.imageUrl ?? undefined,
            count: 0,
          };
        } else {
          if (!artistMap[aKey].serviceId && e.serviceId) artistMap[aKey].serviceId = e.serviceId;
          if (!artistMap[aKey].accountId && e.accountId) artistMap[aKey].accountId = e.accountId;
          if (isPrimary && !artistMap[aKey].artistId && e.artistId) artistMap[aKey].artistId = e.artistId;
          if (!artistMap[aKey].imageUrl && e.imageUrl) artistMap[aKey].imageUrl = e.imageUrl;
        }
        artistMap[aKey].count++;
        if (e.userId) bumpQueuer(queuersByItem, itemKey('artist', aKey), e.userId);
      });
    }

    if (isAlbumOnly) {
      const albumKey = albumKeyFor(e);
      if (e.album && albumKey) {
        if (!albumMap[albumKey]) {
          albumMap[albumKey] = {
            key: albumKey,
            album: e.album,
            artist: e.artist,
            serviceId: e.serviceId ?? undefined,
            accountId: e.accountId ?? undefined,
            artistId: e.artistId ?? undefined,
            albumId: e.albumId ?? undefined,
            imageUrl: e.imageUrl ?? undefined,
            count: 0,
          };
        } else {
          if (!albumMap[albumKey].serviceId && e.serviceId) albumMap[albumKey].serviceId = e.serviceId;
          if (!albumMap[albumKey].accountId && e.accountId) albumMap[albumKey].accountId = e.accountId;
          if (!albumMap[albumKey].albumId && e.albumId) albumMap[albumKey].albumId = e.albumId;
          if (!albumMap[albumKey].artistId && e.artistId) albumMap[albumKey].artistId = e.artistId;
          if (!albumMap[albumKey].imageUrl && e.imageUrl) albumMap[albumKey].imageUrl = e.imageUrl;
        }
        albumMap[albumKey].count++;
        if (e.userId) bumpQueuer(queuersByItem, itemKey('album', albumKey), e.userId);
      }
    }

    if (isTrack) {
      const tKey = trackKeyFor(e);
      if (!trackMap[tKey]) {
        trackMap[tKey] = {
          key: tKey,
          trackName: e.trackName,
          artist: e.artist,
          serviceId: e.serviceId ?? undefined,
          accountId: e.accountId ?? undefined,
          artistId: e.artistId ?? undefined,
          album: e.album ?? undefined,
          albumId: e.albumId ?? undefined,
          imageUrl: e.imageUrl ?? undefined,
          uri: e.uri ?? undefined,
          count: 0,
        };
      } else {
        if (!trackMap[tKey].serviceId && e.serviceId) trackMap[tKey].serviceId = e.serviceId;
        if (!trackMap[tKey].accountId && e.accountId) trackMap[tKey].accountId = e.accountId;
        if (!trackMap[tKey].artistId && e.artistId) trackMap[tKey].artistId = e.artistId;
        if (!trackMap[tKey].album && e.album) trackMap[tKey].album = e.album;
        if (!trackMap[tKey].albumId && e.albumId) trackMap[tKey].albumId = e.albumId;
        if (!trackMap[tKey].imageUrl && e.imageUrl) trackMap[tKey].imageUrl = e.imageUrl;
        if (!trackMap[tKey].uri && e.uri) trackMap[tKey].uri = e.uri;
      }
      trackMap[tKey].count++;
      if (e.userId) bumpQueuer(queuersByItem, itemKey('track', tKey), e.userId);
    }
  }

  return { trackMap, artistMap, albumMap, userCounts, queuersByItem };
}
