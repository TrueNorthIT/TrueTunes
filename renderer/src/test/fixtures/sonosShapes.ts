// The Sonos web-player BFF as the app sees it, built from the invented catalogue. Shapes follow
// SonosWebPlayerAPI.yaml and the response types in renderer/src/types; every name, id and URL is synthetic.

import { artUrl } from './art';
import {
  ACCOUNT_ID,
  ALBUMS,
  ARTISTS,
  SERVICE_ID,
  TRACKS,
  albumById,
  artistById,
  encodeDefaults,
  topSongsOf,
  trackById,
  type CatAlbum,
  type CatArtist,
  type CatTrack,
} from './catalog';

export const sid = (objectId: string) => ({ objectId, serviceId: SERVICE_ID, accountId: ACCOUNT_ID });
const fullId = (objectId: string) => ({ ...sid(objectId), serviceName: 'Mock Music', serviceNameId: 'mock' });
const artistSrn = (artistId: string) => `srn:content:audio:artist:${artistId}#${SERVICE_ID}:${ACCOUNT_ID}`;

export const albumArt = (al: CatAlbum) => artUrl(`album:${al.id}`);
export const artistArt = (ar: CatArtist) => artUrl(`portrait:${ar.id}`);
export const trackArt = (t: CatTrack) => albumArt(albumById(t.albumId)!);

const trackDefaults = (t: CatTrack) =>
  encodeDefaults({
    artistId: t.artistId,
    artist: t.artist,
    containerId: t.albumId,
    containerName: t.album,
    durationMs: t.durationSec * 1000,
    explicit: t.explicit,
  });
const albumDefaults = (al: CatAlbum) => encodeDefaults({ artistId: al.artistId, artist: al.artist });

// ── Browse items (the shape album, artist, playlist and container responses carry) ──

export function browseTrack(t: CatTrack, ordinal = t.ordinal) {
  return {
    id: `srn:content:audio:track:${t.id}`,
    title: t.title,
    subtitle: t.artist,
    images: { tile1x1: trackArt(t) },
    actions: ['PLAY'],
    type: 'ITEM_TRACK',
    resource: { id: sid(t.id), type: 'TRACK', defaults: trackDefaults(t) },
    artists: [{ id: artistSrn(t.artistId), name: t.artist }],
    isExplicit: t.explicit,
    ordinal,
    duration: String(t.durationSec),
  };
}

export function browseAlbumItem(al: CatAlbum) {
  return {
    id: `srn:content:audio:album:${al.id}`,
    title: al.title,
    subtitle: al.artist,
    images: { tile1x1: albumArt(al) },
    actions: ['PLAY'],
    type: 'ITEM_ALBUM',
    resource: { id: sid(al.id), type: 'ALBUM', defaults: albumDefaults(al) },
    artists: [{ id: artistSrn(al.artistId), name: al.artist }],
    isExplicit: false,
  };
}

export function browseArtistItem(ar: CatArtist) {
  return {
    id: artistSrn(ar.id),
    title: ar.name,
    images: { tile1x1: artistArt(ar) },
    actions: ['PLAY'],
    type: 'ITEM_ARTIST',
    resource: { id: sid(ar.id), type: 'ARTIST' },
    isExplicit: false,
  };
}

export const topSongsId = (artistId: string) => `topsongs-${artistId}`;
export const shelfId = {
  quick: 'shelf-quick',
  albums: 'shelf-albums',
  mix: 'supermix',
  newReleases: 'new',
  charts: 'charts',
};

export function containerItem(id: string, title: string) {
  return {
    id: `srn:container:${id}`,
    title,
    images: { tile1x1: artUrl(`shelf:${id}`) },
    type: 'ITEM_AUDIO',
    resource: { id: sid(id), type: 'CONTAINER', defaults: encodeDefaults({ shelf: id }) },
  };
}

const envelope = (title: string, resourceId: string, type: string) => ({
  type,
  id: resourceId,
  title,
  resource: { type, id: sid(resourceId), defaults: encodeDefaults({}) },
  providerInfo: { id: SERVICE_ID, slug: 'mock', name: 'Mock Music' },
});

// ── The responses ──

export function browseAlbum(albumId: string, offset = 0, count = 50) {
  const al = albumById(albumId);
  if (!al) return { error: `No such album ${albumId}` };
  const items = al.tracks.slice(offset, offset + count).map((t) => browseTrack(t));
  return {
    ...envelope(al.title, al.id, 'ALBUM'),
    resource: { type: 'ALBUM', id: sid(al.id), defaults: albumDefaults(al) },
    subtitle: al.artist,
    images: { tile1x1: albumArt(al) },
    isExplicit: false,
    sections: { items: [] },
    tracks: { items, total: al.tracks.length, fastScrollUri: '' },
  };
}

export function browseArtist(artistId: string) {
  const ar = artistById(artistId);
  if (!ar) return { error: `No such artist ${artistId}` };
  const topSongs = {
    id: `srn:playlist:${topSongsId(ar.id)}`,
    title: 'Top songs',
    images: { tile1x1: artistArt(ar) },
    type: 'ITEM_PLAYLIST',
    resource: { id: sid(topSongsId(ar.id)), type: 'PLAYLIST', defaults: encodeDefaults({ artistId: ar.id }) },
    isExplicit: false,
  };
  return {
    ...envelope(ar.name, ar.id, 'ARTIST'),
    images: { tile1x1: artistArt(ar) },
    sections: {
      items: [
        {
          id: 'releases',
          type: 'GRID',
          items: [topSongs, ...ar.albums.map(browseAlbumItem)],
          total: ar.albums.length + 1,
        },
      ],
    },
  };
}

export function browsePlaylist(playlistId: string) {
  const artistId = playlistId.startsWith('topsongs-') ? playlistId.slice('topsongs-'.length) : null;
  const ar = artistId ? artistById(artistId) : null;
  const tracks = ar ? topSongsOf(ar.id) : TRACKS.slice(0, 12);
  return {
    ...envelope(ar ? `${ar.name}: top songs` : 'Mock playlist', playlistId, 'PLAYLIST'),
    subtitle: ar?.name ?? 'Mock Music',
    images: { tile1x1: ar ? artistArt(ar) : artUrl(`shelf:${playlistId}`) },
    owner: { id: 'mock', name: 'Mock Music' },
    isEditable: false,
    isExplicit: false,
    sections: { items: [] },
    tracks: { nextUri: '', items: tracks.map((t, i) => browseTrack(t, i + 1)) },
    resources: { nextUri: '', items: [] },
  };
}

export function browseContainer(containerId: string) {
  switch (containerId) {
    case 'root':
      return {
        sections: {
          items: [
            {
              id: 'root',
              items: [
                containerItem('home', 'Home'),
                containerItem('library', 'Library'),
                containerItem(shelfId.mix, 'My Supermix'),
                containerItem(shelfId.newReleases, 'New releases'),
                containerItem(shelfId.charts, 'Charts'),
              ],
            },
          ],
        },
      };
    case 'home':
      return {
        items: [
          containerItem(shelfId.quick, 'Quick picks'),
          containerItem(shelfId.albums, 'Albums for you'),
          containerItem('shelf-listen', 'Listen again'),
        ],
      };
    case shelfId.newReleases:
      return { items: ALBUMS.slice(-8).map(browseAlbumItem) };
    case shelfId.charts:
      return {
        items: TRACKS.filter((_, i) => i % 9 === 2)
          .slice(0, 12)
          .map((t) => browseTrack(t)),
      };
    case shelfId.mix:
      return {
        items: TRACKS.filter((_, i) => i % 7 === 1)
          .slice(0, 12)
          .map((t) => browseTrack(t)),
      };
    case shelfId.albums:
    case 'shelf-listen':
      return {
        items: ALBUMS.filter((_, i) => i % 2 === 0)
          .slice(0, 10)
          .map(browseAlbumItem),
      };
    case shelfId.quick:
      // A mixed shelf: songs, albums and artists, so the Container page shows every kind of section.
      return {
        items: [
          ...TRACKS.filter((_, i) => i % 11 === 4)
            .slice(0, 8)
            .map((t) => browseTrack(t)),
          ...ALBUMS.filter((_, i) => i % 3 === 1)
            .slice(0, 6)
            .map(browseAlbumItem),
          ...ARTISTS.slice(0, 5).map(browseArtistItem),
        ],
      };
    default:
      return { items: [] };
  }
}

/** Free-text search: every word of the query must appear in the artist, album or track name. */
export function searchService(query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = (...fields: string[]) => {
    const hay = fields.join(' ').toLowerCase();
    return words.every((w) => hay.includes(w));
  };
  const artists = ARTISTS.filter((a) => hits(a.name));
  const albums = ALBUMS.filter((a) => hits(a.title, a.artist));
  const tracks = TRACKS.filter((t) => hits(t.title, t.artist, t.album)).slice(0, 25);
  const info = (n: number) => ({ count: n, offset: 0, pageSize: 50 });
  const artistRef = (id: string, name: string) => ({
    name,
    id: fullId(id),
    type: 'ARTIST',
    playable: true,
    images: [],
  });
  return {
    info: { count: artists.length + albums.length + tracks.length },
    errors: [],
    ARTISTS: {
      info: info(artists.length),
      resources: artists.map((a) => ({
        id: fullId(a.id),
        name: a.name,
        type: 'ARTIST',
        playable: true,
        images: [{ url: artistArt(a) }],
        bio: { content: a.blurb },
        defaults: encodeDefaults({}),
      })),
    },
    ALBUMS: {
      info: info(albums.length),
      resources: albums.map((al) => ({
        id: fullId(al.id),
        name: al.title,
        type: 'ALBUM',
        artists: [artistRef(al.artistId, al.artist)],
        playable: true,
        images: [{ url: albumArt(al) }],
        explicit: false,
        summary: { content: `Album • ${al.artist} • ${al.year}` },
        enumerable: true,
        defaults: albumDefaults(al),
      })),
    },
    TRACKS: {
      info: info(tracks.length),
      resources: tracks.map((t) => ({
        id: fullId(t.id),
        name: t.title,
        type: 'TRACK',
        artists: [artistRef(t.artistId, t.artist)],
        playable: true,
        images: [{ url: trackArt(t) }],
        explicit: t.explicit,
        durationMs: t.durationSec * 1000,
        container: { name: t.album, id: fullId(t.albumId) },
        defaults: trackDefaults(t),
      })),
    },
    PLAYLISTS: { info: info(0), resources: [] },
    PODCASTS: { info: info(0), resources: [] },
    resourceOrder: ['ARTISTS', 'ALBUMS', 'TRACKS'],
    externalLinks: [],
  };
}

/** The now-playing lookup for a track id (what the queue rows and the player bar ask). */
export function trackNowPlaying(trackId: string) {
  const t = trackById(trackId);
  if (!t) return { error: `No such track ${trackId}` };
  const item = browseTrack(t);
  return { title: t.title, subtitle: t.artist, images: { tile1x1: trackArt(t) }, item };
}

// ── Queue and playback ──

/** The track object Sonos puts on a queue item and in the now-playing metadata. */
export function sonosTrack(t: CatTrack) {
  return {
    id: sid(t.id),
    name: t.title,
    type: 'track',
    artist: { name: t.artist },
    album: { name: t.album, id: sid(t.albumId) },
    images: [{ url: trackArt(t) }],
    imageUrl: trackArt(t),
    durationMillis: t.durationSec * 1000,
    explicit: t.explicit,
  };
}

export const queueItem = (t: CatTrack) => ({ id: sid(t.id), track: sonosTrack(t) });

export const QUEUE_ID = 'mock-queue';
export const QUEUE_VERSION = 'mock-queue-v1';
export const GROUP_ID = 'RINCON_MOCK0001400:1';

export function playbackPayload(current: CatTrack, itemId: number, positionMillis: number) {
  return {
    playback: {
      playbackState: 'PLAYBACK_STATE_PAUSED',
      positionMillis,
      itemId: String(itemId),
      queueId: QUEUE_ID,
      queueVersion: QUEUE_VERSION,
      playModes: { shuffle: false, repeat: false, repeatOne: false, crossfade: false },
    },
    metadata: { currentItem: { track: sonosTrack(current) } },
  };
}
