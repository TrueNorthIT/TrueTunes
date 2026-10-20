import { splitArtists } from './aggregate';

export interface RecentArtistEvent {
  eventType?: 'track' | 'album' | null;
  trackName?: string | null;
  artist?: string | null;
  serviceId?: string | null;
  accountId?: string | null;
  artistId?: string | null;
  imageUrl?: string | null;
  timestamp: number;
}

export interface RecentArtist {
  artist: string;
  serviceId?: string;
  accountId?: string;
  artistId?: string;
  imageUrl?: string;
  lastPlayed: number;
}

/**
 * Home "Artists" grid source: one entry per individual artist (credit strings
 * are split with the same rules as aggregate.ts), newest first.
 *
 * `events` must already be sorted newest-first. Only the primary (first-named)
 * artist gets `artistId` and the track art, since `e.artistId` and `e.imageUrl`
 * describe the primary. Featured artists carry neither so the client resolves
 * their id and real photo by name.
 */
export function buildRecentArtists(events: RecentArtistEvent[], limit = 10): RecentArtist[] {
  const map = new Map<string, RecentArtist>();
  for (const e of events) {
    const isTrack = e.eventType === 'track' || e.eventType == null;
    if (!isTrack || !e.trackName) continue;

    splitArtists(e.artist).forEach((name, idx) => {
      const isPrimary = idx === 0;
      const key = name.toLowerCase();
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          artist: name,
          serviceId: e.serviceId ?? undefined,
          accountId: e.accountId ?? undefined,
          artistId: isPrimary ? (e.artistId ?? undefined) : undefined,
          imageUrl: isPrimary ? (e.imageUrl ?? undefined) : undefined,
          lastPlayed: e.timestamp,
        });
      } else {
        if (!existing.serviceId && e.serviceId) existing.serviceId = e.serviceId;
        if (!existing.accountId && e.accountId) existing.accountId = e.accountId;
        if (isPrimary && !existing.artistId && e.artistId) existing.artistId = e.artistId;
        if (isPrimary && !existing.imageUrl && e.imageUrl) existing.imageUrl = e.imageUrl;
      }
    });
  }
  return [...map.values()].slice(0, limit);
}
