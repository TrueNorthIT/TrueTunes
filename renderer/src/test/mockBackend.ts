// A synthetic backend for `window.sonos`, for Storybook page stories. It answers what the real bridge would from the
// invented catalogue in ./fixtures: Sonos browse and search calls, the live playback/queue/group pushes, and the Azure
// Function calls (stats, the daily game, playlists, profiles, the DJ). Reads resolve with data; anything that would
// change the office speakers or the shared queue is left exactly as in sonosFake (it never settles), so a story cannot
// reach Sonos. Nothing here imports vitest or storybook.
//
// Use it by spreading over the fake's defaults: `createSonosFake(wrap, { ...sonosDefaults, ...createMockBackend() })`.

import * as az from './fixtures/azure';
import { artBase64, seedOfArtUrl } from './fixtures/art';
import { TRACKS, type CatTrack } from './fixtures/catalog';
import { ME } from './fixtures/people';
import {
  GROUP_ID,
  QUEUE_VERSION,
  browseAlbum,
  browseArtist,
  browseContainer,
  browsePlaylist,
  playbackPayload,
  queueItem,
  searchService,
  trackNowPlaying,
} from './fixtures/sonosShapes';

export const COORDINATOR_ID = 'RINCON_MOCK0001400';

/** The twenty tracks in the office queue, one in every five of the catalogue, so artists and albums vary. */
export const QUEUE_TRACKS: CatTrack[] = TRACKS.filter((_, i) => i % 5 === 1).slice(0, 20);
/** The track on the speakers: the fourth in the queue, paused 83 seconds in (nothing ticks). */
export const NOW_PLAYING_INDEX = 3;
export const NOW_PLAYING = QUEUE_TRACKS[NOW_PLAYING_INDEX];
const POSITION_MS = 83_000;

/** Deliver on a later microtask, as a real push would arrive after subscribing. */
const later = (fn: () => void) => void Promise.resolve().then(fn);

const unavailable = (what: string) => ({ error: `${what} is not available in the Storybook mock` });

type Params = Record<string, string> | undefined;

function sonosFetch(req: FetchRequest): FetchResponse {
  const p: Params = req.pathParams;
  const q = req.query ?? {};
  const ok = (data: unknown): FetchResponse =>
    'error' in (data as object) ? { error: String((data as { error: string }).error) } : { data };
  switch (req.operationId) {
    case 'browseAlbum':
      return ok(browseAlbum(p?.albumId ?? '', Number(q.offset ?? 0), Number(q.count ?? 50)));
    case 'browseArtist':
      return ok(browseArtist(p?.artistId ?? ''));
    case 'browsePlaylist':
      return ok(browsePlaylist(p?.playlistId ?? ''));
    case 'browseContainer':
      return ok(browseContainer(p?.containerId ?? ''));
    case 'searchService':
    case 'searchHousehold':
      return ok(searchService(q.query ?? ''));
    case 'getTrackNowPlaying':
      return ok(trackNowPlaying(p?.trackId ?? ''));
    case 'getQueueResources': {
      const offset = Number(q.offset ?? 0);
      const count = Number(q.count ?? 50);
      return { data: { items: QUEUE_TRACKS.slice(offset, offset + count).map(queueItem) }, etag: QUEUE_VERSION };
    }
    default:
      // Playback and queue writes land here too: an error, never a change to the speakers.
      return unavailable(req.operationId);
  }
}

export function createMockBackend(): Partial<SonosPreload> {
  const attribution: AttributionMap = Object.fromEntries(QUEUE_TRACKS.map((t, i) => [t.id, az.attributionFor(t, i)]));
  const upcoming = (): DjTrack[] =>
    az
      .djSet()
      .tracks.filter((t) => !QUEUE_TRACKS.some((q) => q.id === t.uri))
      .slice(0, 3);

  return {
    // ── Live pushes: one initial delivery on subscribe, then silence ──
    onAuthReady: (cb) => (later(cb), () => {}),
    onWsReady: (cb) => (later(cb), () => {}),
    onWsGroups: (cb) => (
      later(() => cb([{ id: GROUP_ID, name: 'Office speakers', coordinatorId: COORDINATOR_ID }])),
      () => {}
    ),
    onWsMessage: (cb) => (
      later(() => {
        cb({ namespace: 'groupVolume', groupId: GROUP_ID }, { volume: 35 });
        cb(
          { namespace: 'playbackExtended', groupId: GROUP_ID },
          playbackPayload(NOW_PLAYING, NOW_PLAYING_INDEX + 1, POSITION_MS)
        );
      }),
      () => {}
    ),
    onAttributionMap: (cb) => (later(() => cb(attribution)), () => {}),
    onEntraReady: (cb) => (
      later(() => cb({ oid: 'mock-oid', name: ME, email: 'wren.calloway@example.invalid' })),
      () => {}
    ),

    // ── Sonos ──
    fetch: (req) => Promise.resolve(sonosFetch(req)),
    fetchImage: (url) => {
      const seed = seedOfArtUrl(url);
      return Promise.resolve(
        seed === null ? { error: 'not a mock image' } : { data: artBase64(seed), mimeType: 'image/svg+xml' }
      );
    },
    getActiveGroup: () => Promise.resolve(COORDINATOR_ID),
    refreshPlayback: () => Promise.resolve(),
    refreshAttribution: () => Promise.resolve(),
    resync: () => Promise.resolve(),
    djAutoplay: () =>
      Promise.resolve({ enabled: true, leaseHeld: false, enqueue: null, upcoming: upcoming(), fillerUri: null }),

    // ── Who am I ──
    getDisplayName: () => Promise.resolve(ME),
    getEntraUser: () => Promise.resolve({ oid: 'mock-oid', name: ME, email: 'wren.calloway@example.invalid' }),
    getVersion: () => Promise.resolve('1.0.0'),

    // ── Azure Functions ──
    fetchUsers: (includeSelf) => Promise.resolve(az.users(!!includeSelf)),
    fetchUserProfile: (name) => Promise.resolve(az.userProfile(name)),
    fetchOfficePresence: () => Promise.resolve(az.presence()),
    fetchDjSet: () => Promise.resolve(az.djSet()),
    fetchStats: (period, userId, count) => Promise.resolve(az.stats(period, userId, count)),
    fetchRecentlyPlayed: (userId) => Promise.resolve(az.recentlyPlayed(userId)),
    fetchMusicStats: () => Promise.resolve(az.musicStats()),
    fetchDailyGame: (date) => Promise.resolve(az.game(date ?? az.GAME_IDS[0])),
    fetchGameLeaderboard: (date) => Promise.resolve(az.gameLeaderboard(date ?? az.GAME_IDS[0])),
    fetchGameDates: () => Promise.resolve(az.gameDates()),
    fetchMyScore: (gameId, userName) => Promise.resolve(az.myScore(gameId, userName)),
    fetchGameStats: (date) => Promise.resolve(az.gameStats(date ?? az.GAME_IDS[0])),
    fetchPlaylists: (filter) => Promise.resolve(az.playlists(filter)),
    fetchPlaylist: (id) => {
      const doc = az.playlistDoc(id);
      return doc ? Promise.resolve(doc) : Promise.reject(new Error('playlist not found'));
    },
    ensureFavourites: () => Promise.resolve(az.playlistDoc(`fav-${ME}`)!),

    // ── Genius ──
    geniusArtist: (name) => Promise.resolve(az.geniusArtist(name)),
    geniusAlbumAbout: (album) => Promise.resolve(az.geniusAlbumAbout(album)),
    geniusAlbumYear: (album) => Promise.resolve(az.geniusAlbumYear(album)),
    geniusArtistAlbums: (artist) => Promise.resolve(az.geniusArtistAlbums(artist)),
    geniusDescription: (track) => Promise.resolve(az.geniusTrackDescription(track)),
  };
}
