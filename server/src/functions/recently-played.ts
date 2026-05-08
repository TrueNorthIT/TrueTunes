import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { CosmosClient } from '@azure/cosmos';

interface RawEvent {
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
  timestamp: number;
}

interface RecentTrack {
  trackName: string;
  artist: string;
  serviceId?: string;
  accountId?: string;
  artistId?: string;
  album?: string;
  albumId?: string;
  imageUrl?: string;
  uri?: string;
  lastPlayed: number;
}

interface RecentArtist {
  artist: string;
  serviceId?: string;
  accountId?: string;
  artistId?: string;
  imageUrl?: string;
  lastPlayed: number;
}

interface RecentAlbum {
  album: string;
  artist: string;
  serviceId?: string;
  accountId?: string;
  artistId?: string;
  albumId?: string;
  imageUrl?: string;
  lastPlayed: number;
}

export async function recentlyPlayedHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const connStr = process.env['COSMOS_CONNECTION_STRING'];
  const dbName  = process.env['COSMOS_DATABASE'] ?? 'truetunes';
  const ctrName = process.env['COSMOS_CONTAINER'] ?? 'events';

  if (!connStr) return { status: 500, jsonBody: { error: 'Cosmos not configured' } };

  const userId = request.query.get('userId');
  if (!userId) return { status: 400, jsonBody: { error: 'userId required' } };

  const days    = parseInt(request.query.get('days') ?? '7', 10);
  const startMs = Date.now() - days * 24 * 60 * 60 * 1000;

  try {
    const client    = new CosmosClient(connStr);
    const container = client.database(dbName).container(ctrName);

    const usersStart = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const [eventsResult, usersResult] = await Promise.all([
      container.items.query<RawEvent>({
        query: `SELECT c.eventType, c.trackName, c.artist, c.serviceId, c.accountId,
                       c.artistId, c.album, c.albumId, c.imageUrl, c.uri, c.timestamp
                FROM c
                WHERE c.userId = @userId AND c.timestamp >= @start`,
        parameters: [
          { name: '@userId', value: userId },
          { name: '@start',  value: startMs },
        ],
      }).fetchAll(),
      container.items.query<string>({
        query: 'SELECT DISTINCT VALUE c.userId FROM c WHERE c.timestamp >= @usersStart',
        parameters: [{ name: '@usersStart', value: usersStart }],
      }).fetchAll(),
    ]);

    const { resources } = eventsResult;
    const availableUsers: string[] = usersResult.resources.filter(Boolean).sort();

    // Sort most-recent first, then deduplicate — keeping the first (most recent) occurrence of each key.
    resources.sort((a, b) => b.timestamp - a.timestamp);

    const trackMap  = new Map<string, RecentTrack>();
    const artistMap = new Map<string, RecentArtist>();
    const albumMap  = new Map<string, RecentAlbum>();

    for (const e of resources) {
      const isTrack    = e.eventType === 'track' || e.eventType == null;
      const isAlbumEvt = e.eventType === 'album'  || e.eventType == null;

      if (isTrack && e.trackName && e.artist) {
        const key = `${e.trackName}||${e.artist}`;
        if (!trackMap.has(key)) {
          trackMap.set(key, {
            trackName:  e.trackName,
            artist:     e.artist,
            serviceId:  e.serviceId  ?? undefined,
            accountId:  e.accountId  ?? undefined,
            artistId:   e.artistId   ?? undefined,
            album:      e.album      ?? undefined,
            albumId:    e.albumId    ?? undefined,
            imageUrl:   e.imageUrl   ?? undefined,
            uri:        e.uri        ?? undefined,
            lastPlayed: e.timestamp,
          });
        }

        if (e.artist) {
          const aKey = e.artist;
          if (!artistMap.has(aKey)) {
            artistMap.set(aKey, {
              artist:    e.artist,
              serviceId: e.serviceId  ?? undefined,
              accountId: e.accountId  ?? undefined,
              artistId:  e.artistId   ?? undefined,
              imageUrl:  e.imageUrl   ?? undefined,
              lastPlayed: e.timestamp,
            });
          }
        }
      }

      if (isAlbumEvt && e.album) {
        const aKey = e.albumId ?? e.album;
        if (!albumMap.has(aKey)) {
          albumMap.set(aKey, {
            album:     e.album,
            artist:    e.artist,
            serviceId: e.serviceId  ?? undefined,
            accountId: e.accountId  ?? undefined,
            artistId:  e.artistId   ?? undefined,
            albumId:   e.albumId    ?? undefined,
            imageUrl:  e.imageUrl   ?? undefined,
            lastPlayed: e.timestamp,
          });
        }
      }
    }

    const tracks  = [...trackMap.values()].slice(0, 20);
    const artists = [...artistMap.values()].slice(0, 10);
    const albums  = [...albumMap.values()].slice(0, 10);

    context.log(`[recently-played] userId=${userId} tracks=${tracks.length} artists=${artists.length} albums=${albums.length} users=${availableUsers.length}`);

    return {
      jsonBody: { tracks, artists, albums, availableUsers },
      headers: { 'Access-Control-Allow-Origin': '*' },
    };
  } catch (err) {
    context.error('[recently-played] query failed:', err);
    return { status: 500, jsonBody: { error: String(err) } };
  }
}

app.http('recently-played', {
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: recentlyPlayedHandler,
});
