// renderer/src/lib/sonosApi.ts
// ES module version of the Sonos API client.
// Calls window.sonos.fetch (set by preload contextBridge) under the hood.

// ─── IPC types ───────────────────────────────────────────────────────────────

interface FetchResponse {
  data?: unknown;
  error?: string;
  etag?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function call(
  operationId: string,
  options: {
    pathParams?: Record<string, string>;
    query?: Record<string, string | undefined>;
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
): Promise<FetchResponse> {
  return window.sonos.fetch({ operationId, ...options });
}

function defined(obj: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(obj).filter((e): e is [string, string] => e[1] !== undefined)
  );
}

// ─── API surface ──────────────────────────────────────────────────────────────

function buildApi() {
  return {

    auth: {
      getDiscovery: () => call('getAuthDiscovery'),
    },

    groups: {
      list: () => call('getGroups'),
    },

    playback: {
      getState:  (groupId?: string) => call('getPlaybackState',    { pathParams: defined({ groupId }) }),
      play:      (groupId?: string) => call('play',                { pathParams: defined({ groupId }) }),
      pause:     (groupId?: string) => call('pause',               { pathParams: defined({ groupId }) }),
      skipNext:    (groupId?: string) => call('skipToNextTrack',     { pathParams: defined({ groupId }) }),
      skipPrev:    (groupId?: string) => call('skipToPreviousTrack', { pathParams: defined({ groupId }) }),
      setPlayMode: (body: { shuffle?: boolean; repeat?: boolean; repeatOne?: boolean; crossfade?: boolean }, groupId?: string) =>
        call('setPlayMode', { pathParams: defined({ groupId }), body }),
      seek: (positionMillis: number, groupId?: string) =>
        call('seek', { pathParams: defined({ groupId }), body: { positionMillis } }),
    },

    queue: {
      list: (params?: { groupId?: string; queueId?: string; serviceId?: string; accountId?: string; count?: number; offset?: number }) =>
        call('getQueueResources', {
          pathParams: defined({ groupId: params?.groupId, queueId: params?.queueId, serviceId: params?.serviceId, accountId: params?.accountId }),
          query: defined({ count: params?.count?.toString(), offset: params?.offset?.toString() }),
        }),

      add: (body: unknown, params?: { groupId?: string; queueId?: string; serviceId?: string; accountId?: string; position?: number; ifMatch?: string }) =>
        call('addQueueResource', {
          pathParams: defined({ groupId: params?.groupId, queueId: params?.queueId, serviceId: params?.serviceId, accountId: params?.accountId }),
          query: { position: String(params?.position ?? -1) },
          headers: params?.ifMatch ? { 'If-Match': params.ifMatch } : undefined,
          body,
        }),

      remove: (items: number[], params?: { groupId?: string; queueId?: string; serviceId?: string; accountId?: string }) =>
        call('deleteQueueResources', {
          pathParams: defined({ groupId: params?.groupId, queueId: params?.queueId, serviceId: params?.serviceId, accountId: params?.accountId }),
          query: { items: items.join(',') },
        }),

      reorder: (items: number[], positions: number[], body: unknown[], params?: { groupId?: string; queueId?: string; serviceId?: string; accountId?: string }) =>
        call('reorderQueueResources', {
          pathParams: defined({ groupId: params?.groupId, queueId: params?.queueId, serviceId: params?.serviceId, accountId: params?.accountId }),
          query: { items: items.join(','), positions: positions.join(',') },
          body,
        }),
    },

    browse: {
      album: (albumId: string, params?: { serviceId?: string; accountId?: string; defaults?: string; muse2?: boolean; count?: number }) =>
        call('browseAlbum', {
          pathParams: { albumId, ...defined({ serviceId: params?.serviceId, accountId: params?.accountId }) },
          query: defined({ defaults: params?.defaults, muse2: params?.muse2 ? 'true' : undefined, count: params?.count?.toString() }),
        }),

      artist: (artistId: string, params?: { serviceId?: string; accountId?: string; defaults?: string; muse2?: boolean }) =>
        call('browseArtist', {
          pathParams: { artistId, ...defined({ serviceId: params?.serviceId, accountId: params?.accountId }) },
          query: defined({ defaults: params?.defaults, muse2: params?.muse2 ? 'true' : undefined }),
        }),

      container: (containerId: string, params?: { serviceId?: string; accountId?: string; defaults?: string; muse2?: boolean }) =>
        call('browseContainer', {
          pathParams: { containerId, ...defined({ serviceId: params?.serviceId, accountId: params?.accountId }) },
          query: defined({ defaults: params?.defaults, muse2: params?.muse2 ? 'true' : undefined }),
        }),

      playlist: (playlistId: string, params?: { serviceId?: string; accountId?: string; defaults?: string; muse2?: boolean; count?: number }) =>
        call('browsePlaylist', {
          pathParams: { playlistId, ...defined({ serviceId: params?.serviceId, accountId: params?.accountId }) },
          query: defined({ defaults: params?.defaults, muse2: params?.muse2 ? 'true' : undefined, count: params?.count?.toString() }),
        }),

      catalogContainer: (containerId: string, params?: { serviceId?: string; accountId?: string; count?: number }) =>
        call('getCatalogContainerResources', {
          pathParams: { containerId, ...defined({ serviceId: params?.serviceId, accountId: params?.accountId }) },
          query: defined({ count: params?.count?.toString() }),
        }),
    },

    content: {
      favorites: (params?: { serviceId?: string; accountId?: string; count?: number; resources?: string }) =>
        call('getFavoriteResources', {
          pathParams: defined({ serviceId: params?.serviceId, accountId: params?.accountId }),
          query: defined({ count: params?.count?.toString(), resources: params?.resources }),
        }),

      history: (params?: { serviceId?: string; accountId?: string; count?: number }) =>
        call('getHistory', {
          pathParams: defined({ serviceId: params?.serviceId, accountId: params?.accountId }),
          query: defined({ count: params?.count?.toString() }),
        }),
    },

    search: {
      query: (q: string, services?: string[]) =>
        call('searchHousehold', {
          query: defined({ query: q, services: services?.join(',') }),
        }),

      serviceQuery: (q: string, params?: { serviceId?: string; accountId?: string; count?: number }) =>
        call('searchService', {
          pathParams: defined({ serviceId: params?.serviceId, accountId: params?.accountId }),
          query: defined({ query: q, count: params?.count?.toString() }),
        }),
    },

    integrations: {
      list: () => call('getIntegrations'),
      registrations: () => call('getIntegrationRegistrations'),
    },

    nowPlaying: {
      track: (trackId: string, params?: { serviceId?: string; accountId?: string }) =>
        call('getTrackNowPlaying', {
          pathParams: { trackId, ...defined({ serviceId: params?.serviceId, accountId: params?.accountId }) },
        }),
    },

    platform: {
      mfe: () => call('getMfe'),
      featureFlag: (key: string) => call('getOptimizelyConfig', { pathParams: { key } }),
      metrics: (events: unknown[]) => call('postMetrics', { body: events }),
    },

  };
}

export type SonosApiClient = ReturnType<typeof buildApi>;
export const api = buildApi();
