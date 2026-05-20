import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

type VoidCallback = () => void;
type Unsubscribe = () => void;

const subscribe = <T>(
  event: string,
  cb: (payload: T) => void,
  buffered?: () => T | null,
): Unsubscribe => {
  if (buffered) {
    const v = buffered();
    if (v !== null && v !== undefined) cb(v);
  }
  let unlisten: UnlistenFn | null = null;
  let cancelled = false;
  listen<T>(event, (e) => cb(e.payload)).then((fn) => {
    if (cancelled) fn();
    else unlisten = fn;
  });
  return () => {
    cancelled = true;
    if (unlisten) unlisten();
  };
};

let _authReady = false;
let _wsReady = false;
let _wsGroups: unknown[] | null = null;
let _attributionMap: AttributionMap | null = null;

listen('auth:ready', () => { _authReady = true; });
listen('auth:expired', () => { _authReady = false; });
listen('ws:ready', () => { _wsReady = true; });
listen<unknown[]>('ws:groups', (e) => { _wsGroups = e.payload; });
listen<AttributionMap>('attribution:map', (e) => { _attributionMap = e.payload; });

export const createTauriBridge = (): SonosPreload => ({
  getVersion: () => invoke<string>('app_version'),
  isNewVersion: () => invoke<boolean>('app_is_new_version'),
  openExternal: (url) => invoke('app_open_external', { url }),

  onAuthReady: (cb: VoidCallback) => subscribe<null>('auth:ready', () => cb(), () => (_authReady ? null : null)),
  onAuthExpired: (cb: VoidCallback) => subscribe<null>('auth:expired', () => cb()),

  fetch: (request) => invoke<FetchResponse>('api_fetch', { request }),

  onWsMessage: (cb) => subscribe<[unknown, unknown]>('ws:message', ([h, p]) => cb(h, p)),
  onWsReady: (cb: VoidCallback) => {
    if (_wsReady) cb();
    return subscribe<null>('ws:ready', () => cb());
  },
  onWsGroups: (cb) => {
    if (_wsGroups !== null) cb(_wsGroups);
    return subscribe<unknown[]>('ws:groups', (groups) => cb(groups));
  },

  getActiveGroup: () => invoke<string | null>('group_get_active'),
  setGroup: (groupId) => invoke<{ ok?: boolean; error?: string }>('group_set', { groupId }),
  setGroupVolume: (volume) => invoke('volume_group_set', { volume }),

  setQueueId: (queueId) => invoke('queue_set_id', { queueId }),
  loadContent: (payload) => invoke('playback_load_content', { payload }),
  fetchImage: (url) => invoke('image_fetch', { url }),

  refreshPlayback: () => invoke('playback_refresh'),
  resync: () => invoke('ws_resync'),
  setPlayModes: (modes) => invoke('playback_set_play_modes', { modes }),
  play: () => invoke('playback_play'),
  pause: () => invoke('playback_pause'),
  skipNext: () => invoke('playback_skip_next'),
  skipPrev: () => invoke('playback_skip_prev'),
  skipToTrack: (trackNumber) => invoke('playback_skip_to_track', { trackNumber }),
  seek: (positionMillis) => invoke('playback_seek', { positionMillis }),
  reorderQueue: (fromIndices, toIndex, queueLength) =>
    invoke('queue_reorder', { fromIndices, toIndex, queueLength }),
  removeFromQueue: (indices) => invoke('queue_remove', { indices }),
  clearQueue: () => invoke('queue_clear'),

  openWsMonitor: () => invoke('debug_open_ws_monitor'),
  openHttpMonitor: () => invoke('debug_open_http_monitor'),
  openDevTools: () => invoke('debug_open_dev_tools'),
  openMiniPlayer: () => invoke('mini_open'),
  closeMiniPlayer: () => invoke('mini_close'),

  getDisplayName: () => invoke<string | null>('config_get_display_name'),
  setDisplayName: (name) => invoke('config_set_display_name', { name }),
  getQueueDockedWidth: () => invoke<number>('config_get_queue_docked_width'),
  setQueueDockedWidth: (width) => invoke('config_set_queue_docked_width', { width }),
  publishQueued: (item) => invoke('pubsub_publish_queued', { item }),

  onAttributionMap: (cb) => {
    if (_attributionMap !== null) cb(_attributionMap);
    return subscribe<AttributionMap>('attribution:map', (map) => cb(map));
  },
  onAttributionEvent: (cb) => subscribe<AttributionEvent>('attribution:event', (event) => cb(event)),
  refreshAttribution: () => invoke('attribution_refresh'),

  fetchStats: (period, userId, count) => invoke('stats_fetch', { period, userId, count }),
  fetchDailyGame: (date) => invoke('game_fetch', { date }),
  submitGameScore: (input) => invoke('game_submit', { input }),
  fetchGameLeaderboard: (date) => invoke('game_leaderboard', { date }),
  fetchGameDates: (userName) => invoke('game_dates', { userName }),
  fetchMyScore: (gameId, userName) => invoke('game_my_score', { gameId, userName }),
  fetchGameStats: (date) => invoke('game_stats', { date }),
  fetchRecentlyPlayed: (userId) => invoke('history_recent', { userId }),

  geniusDescription: (trackName, artistName) => invoke('genius_description', { trackName, artistName }),
  geniusArtist: (artistName, trackHint) => invoke('genius_artist', { artistName, trackHint }),
  geniusAlbumYear: (albumName, artistName) => invoke('genius_album_year', { albumName, artistName }),

  trackEvent: (name, properties) => invoke('telemetry_event', { name, properties }),

  minimizeWindow: () => invoke('win_minimize'),
  maximizeWindow: () => invoke('win_maximize'),
  closeWindow: () => invoke('win_close'),
  isWindowMaximized: () => invoke<boolean>('win_is_maximized'),
  onWindowMaximized: (cb) => subscribe<boolean>('win:maximized', (m) => cb(m)),

  onUpdateDownloaded: (cb) => subscribe<string>('update:downloaded', (v) => cb(v)),
  installUpdate: () => invoke('update_install'),

  fetchPlaylists: (filter) => invoke('playlist_list', { filter }),
  fetchPlaylist: (id) => invoke('playlist_get', { id }),
  createPlaylist: (name, isPublic) => invoke('playlist_create', { name, isPublic }),
  updatePlaylist: (playlistId, patch) => invoke('playlist_update', { playlistId, patch }),
  deletePlaylist: (playlistId) => invoke('playlist_delete', { playlistId }),
  addTrackToPlaylist: (playlistId, track) => invoke('playlist_add_track', { playlistId, track }),
  removeTrackFromPlaylist: (playlistId, uri) => invoke('playlist_remove_track', { playlistId, uri }),
  reorderPlaylistTracks: (playlistId, fromIndex, toIndex) =>
    invoke('playlist_reorder_tracks', { playlistId, fromIndex, toIndex }),
  joinPlaylist: (playlistId, action) => invoke('playlist_join', { playlistId, action }),
  uploadPlaylistImage: (playlistId, data, mimeType, userName) =>
    invoke('playlist_upload_image', { playlistId, data: Array.from(new Uint8Array(data)), mimeType, userName }),

  ensureFavourites: () => invoke('profile_ensure_favourites'),
  fetchUsers: () => invoke('users_list'),
  fetchUserProfile: (userName) => invoke('profile_get', { userName }),
  uploadProfileImage: (userName, data, mimeType) =>
    invoke('profile_upload_image', { userName, data: Array.from(new Uint8Array(data)), mimeType }),
});

export const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export const installTauriBridgeIfNeeded = (): void => {
  if (typeof window === 'undefined') return;
  if ((window as unknown as { sonos?: unknown }).sonos) return;
  if (!isTauri()) return;
  (window as unknown as { sonos: SonosPreload }).sonos = createTauriBridge();
};
