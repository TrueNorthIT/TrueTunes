// Ported from TrueTunes/src/main.ts (OPERATIONS + platform constants).
// Reverse-engineered BFF paths - see SonosWebPlayerAPI.yaml in the desktop repo.

export type HttpMethod = 'GET' | 'POST' | 'DELETE' | 'PATCH';

export interface Operation {
  method: HttpMethod;
  path: string;
}

// YouTube Music service constants used for the nowPlaying fallback lookup.
// Generic Sonos platform IDs, not user-specific.
export const SEARCH_SERVICE_ID = '72711';
export const SEARCH_ACCOUNT_ID = '13';

// Platform-level IDs for queue, favourites and history. Fixed for the platform.
export const PLATFORM_SERVICE_ID = '16751367';
export const PLATFORM_ACCOUNT_ID = '123209393';

const QUEUE =
  '/api/content/v1/groups/:groupId/services/:platformServiceId/accounts/:platformAccountId/queues/:queueId/resources';
const V2_ACCOUNT = '/api/content/v2/households/:householdId/services/:serviceId/accounts/:accountId';
const V1_PLATFORM = '/api/content/v1/households/:householdId/services/:platformServiceId/accounts/:platformAccountId';

export const OPERATIONS: Record<string, Operation> = {
  // Auth
  getAuthDiscovery: { method: 'GET', path: '/api/authz/discovery' },
  // Groups
  getGroups: { method: 'GET', path: '/api/groups/v1/households/:householdId/groups' },
  // Queue - platform-level service IDs, not the user's integration service ID.
  getQueueResources: { method: 'GET', path: QUEUE },
  addQueueResource: { method: 'POST', path: QUEUE },
  deleteQueueResources: { method: 'DELETE', path: QUEUE },
  reorderQueueResources: { method: 'PATCH', path: QUEUE },
  // Browse
  browseAlbum: { method: 'GET', path: `${V2_ACCOUNT}/albums/:albumId/browse` },
  browseArtist: { method: 'GET', path: `${V2_ACCOUNT}/artists/:artistId/browse` },
  browseContainer: { method: 'GET', path: `${V2_ACCOUNT}/containers/:containerId/browse` },
  browsePlaylist: { method: 'GET', path: `${V2_ACCOUNT}/playlists/:playlistId/browse` },
  getCatalogContainerResources: {
    method: 'GET',
    path: '/api/content/v1/households/:householdId/services/:serviceId/accounts/:accountId/catalog/containers/:containerId/resources',
  },
  // Favourites & History - platform-level IDs
  getFavoriteResources: { method: 'GET', path: `${V1_PLATFORM}/favorites/resources` },
  getHistory: { method: 'GET', path: `${V1_PLATFORM}/history` },
  // Search
  searchHousehold: { method: 'GET', path: '/api/content/v1/households/:householdId/search' },
  searchService: {
    method: 'GET',
    path: '/api/content/v1/households/:householdId/services/:searchServiceId/accounts/:searchAccountId/search',
  },
  // Integrations
  getIntegrations: { method: 'GET', path: '/api/content/v1/households/:householdId/integrations' },
  getIntegrationRegistrations: {
    method: 'GET',
    path: '/api/content/v1/households/:householdId/integrations/registrations',
  },
  // Now Playing
  getTrackNowPlaying: { method: 'GET', path: `${V2_ACCOUNT}/tracks/:trackId/nowplaying` },
  // Playback (BFF paths)
  getPlaybackState: { method: 'GET', path: '/api/playback/v1/groups/:groupId' },
  play: { method: 'POST', path: '/api/playback/v1/groups/:groupId/play' },
  pause: { method: 'POST', path: '/api/playback/v1/groups/:groupId/pause' },
  skipToNextTrack: { method: 'POST', path: '/api/playback/v1/groups/:groupId/skipToNextTrack' },
  skipToPreviousTrack: { method: 'POST', path: '/api/playback/v1/groups/:groupId/skipToPreviousTrack' },
  setPlayMode: { method: 'POST', path: '/api/playback/v1/groups/:groupId/playMode' },
  // Platform
  getMfe: { method: 'GET', path: '/api/mfe' },
  getOptimizelyConfig: { method: 'GET', path: '/api/optimizely/:key' },
  postMetrics: { method: 'POST', path: '/api/metrics' },
};
