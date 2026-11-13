// Sonos's web API through the gateway: the desktop's src/sonos-api.ts in gateway mode.
// OPERATIONS is a copy of the desktop's table; a test compares the two so they cannot drift.

import { NO_TOKEN, type Gateway } from './gateway';

type HttpMethod = 'GET' | 'POST' | 'DELETE' | 'PATCH';

interface Operation {
  method: HttpMethod;
  path: string;
}

export const OPERATIONS: Record<string, Operation> = {
  // Auth
  getAuthDiscovery: { method: 'GET', path: '/api/authz/discovery' },
  // Groups
  getGroups: {
    method: 'GET',
    path: '/api/groups/v1/households/:householdId/groups',
  },
  // Queue — uses platform-level service IDs, not the user's integration service ID.
  getQueueResources: {
    method: 'GET',
    path: '/api/content/v1/groups/:groupId/services/:platformServiceId/accounts/:platformAccountId/queues/:queueId/resources',
  },
  addQueueResource: {
    method: 'POST',
    path: '/api/content/v1/groups/:groupId/services/:platformServiceId/accounts/:platformAccountId/queues/:queueId/resources',
  },
  deleteQueueResources: {
    method: 'DELETE',
    path: '/api/content/v1/groups/:groupId/services/:platformServiceId/accounts/:platformAccountId/queues/:queueId/resources',
  },
  reorderQueueResources: {
    method: 'PATCH',
    path: '/api/content/v1/groups/:groupId/services/:platformServiceId/accounts/:platformAccountId/queues/:queueId/resources',
  },
  // Browse
  browseAlbum: {
    method: 'GET',
    path: '/api/content/v2/households/:householdId/services/:serviceId/accounts/:accountId/albums/:albumId/browse',
  },
  browseArtist: {
    method: 'GET',
    path: '/api/content/v2/households/:householdId/services/:serviceId/accounts/:accountId/artists/:artistId/browse',
  },
  browseContainer: {
    method: 'GET',
    path: '/api/content/v2/households/:householdId/services/:serviceId/accounts/:accountId/containers/:containerId/browse',
  },
  browsePlaylist: {
    method: 'GET',
    path: '/api/content/v2/households/:householdId/services/:serviceId/accounts/:accountId/playlists/:playlistId/browse',
  },
  getCatalogContainerResources: {
    method: 'GET',
    path: '/api/content/v1/households/:householdId/services/:serviceId/accounts/:accountId/catalog/containers/:containerId/resources',
  },
  // Favorites & History — use platform-level IDs, not integration service IDs
  getFavoriteResources: {
    method: 'GET',
    path: '/api/content/v1/households/:householdId/services/:platformServiceId/accounts/:platformAccountId/favorites/resources',
  },
  getHistory: {
    method: 'GET',
    path: '/api/content/v1/households/:householdId/services/:platformServiceId/accounts/:platformAccountId/history',
  },
  // Search
  searchHousehold: {
    method: 'GET',
    path: '/api/content/v1/households/:householdId/search',
  },
  searchService: {
    method: 'GET',
    path: '/api/content/v1/households/:householdId/services/:searchServiceId/accounts/:searchAccountId/search',
  },
  // Integrations
  getIntegrations: {
    method: 'GET',
    path: '/api/content/v1/households/:householdId/integrations',
  },
  getIntegrationRegistrations: {
    method: 'GET',
    path: '/api/content/v1/households/:householdId/integrations/registrations',
  },
  // Now Playing
  getTrackNowPlaying: {
    method: 'GET',
    path: '/api/content/v2/households/:householdId/services/:serviceId/accounts/:accountId/tracks/:trackId/nowplaying',
  },
  // Playback (BFF paths — verify by intercepting traffic)
  getPlaybackState: { method: 'GET', path: '/api/playback/v1/groups/:groupId' },
  play: { method: 'POST', path: '/api/playback/v1/groups/:groupId/play' },
  pause: { method: 'POST', path: '/api/playback/v1/groups/:groupId/pause' },
  skipToNextTrack: {
    method: 'POST',
    path: '/api/playback/v1/groups/:groupId/skipToNextTrack',
  },
  skipToPreviousTrack: {
    method: 'POST',
    path: '/api/playback/v1/groups/:groupId/skipToPreviousTrack',
  },
  setPlayMode: {
    method: 'POST',
    path: '/api/playback/v1/groups/:groupId/playMode',
  },
  // Platform
  getMfe: { method: 'GET', path: '/api/mfe' },
  getOptimizelyConfig: { method: 'GET', path: '/api/optimizely/:key' },
  postMetrics: { method: 'POST', path: '/api/metrics' },
};

// Fixed Sonos identifiers, as in the desktop's state.ts.
const SEARCH_SERVICE_ID = '72711';
const SEARCH_ACCOUNT_ID = '13';
const PLATFORM_SERVICE_ID = '16751367';
const PLATFORM_ACCOUNT_ID = '123209393';

/** What the bridge has learnt about the household: filled in by the relay's bootstrap and service discovery. */
export interface SonosConfig {
  householdId?: string;
  serviceId?: string;
  accountId?: string;
  groupId?: string;
  queueId?: string;
}

const TRANSIENT_STATUSES = new Set([500, 502, 503, 504]);
const RETRY_DELAYS_MS = [250, 750];
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface SonosHttp {
  fetch(request: FetchRequest, isRetry?: boolean): Promise<FetchResponse>;
  discoverServiceCredentials(): Promise<void>;
}

export function createSonosHttp(o: { gateway: Gateway; config: SonosConfig }): SonosHttp {
  const { gateway, config } = o;

  /** `/sonos/api/...?query`: the path the gateway forwards to play.sonos.com. */
  function buildPath(
    operationPath: string,
    pathParams: Record<string, string> = {},
    query: Record<string, string | undefined> = {}
  ): string {
    const defaults: Record<string, string> = {};
    if (config.householdId) defaults['householdId'] = config.householdId;
    if (config.serviceId) defaults['serviceId'] = config.serviceId;
    if (config.accountId) defaults['accountId'] = config.accountId;
    defaults['searchServiceId'] = SEARCH_SERVICE_ID;
    defaults['searchAccountId'] = SEARCH_ACCOUNT_ID;
    defaults['platformServiceId'] = PLATFORM_SERVICE_ID;
    defaults['platformAccountId'] = PLATFORM_ACCOUNT_ID;
    if (config.groupId) defaults['groupId'] = config.groupId;
    if (config.queueId) defaults['queueId'] = config.queueId;

    const params = { ...defaults, ...pathParams };
    const urlPath = operationPath.replace(/:([a-zA-Z]+)/g, (_, key: string) => {
      if (!(key in params)) throw new Error(`Missing path param: ${key}`);
      return encodeURIComponent(params[key]);
    });
    const qs = Object.entries(query)
      .filter((entry): entry is [string, string] => entry[1] !== undefined)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    return `/sonos${urlPath}${qs ? `?${qs}` : ''}`;
  }

  async function sendWithRetries(
    path: string,
    init: RequestInit,
    retryable: boolean
  ): Promise<{ response: Response; bodyText: string } | { error: string }> {
    for (let attempt = 0; ; attempt++) {
      let response: Response | null = null;
      let networkError = '';
      try {
        response = await gateway.fetch(path, init);
      } catch (err) {
        networkError = `Fetch failed: ${err instanceof Error ? err.message : String(err)}`;
      }
      if (!response && !networkError) return { error: NO_TOKEN };

      const transient = !response || TRANSIENT_STATUSES.has(response.status);
      if (transient && retryable && attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      if (!response) return { error: networkError };
      return { response, bodyText: await response.text().catch(() => '') };
    }
  }

  /** `isRetry`: the service self-heal's retry, which may not heal again. */
  async function sonosFetch(request: FetchRequest, isRetry = false): Promise<FetchResponse> {
    const operation = OPERATIONS[request.operationId];
    if (!operation) return { error: `Unknown operation: ${request.operationId}` };

    let path: string;
    try {
      path = buildPath(operation.path, request.pathParams, request.query);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // If the only missing param is serviceId, find the service now and retry once.
      if (msg.includes('serviceId') && !config.serviceId) {
        await discoverServiceCredentials();
        try {
          path = buildPath(operation.path, request.pathParams, request.query);
        } catch (retryErr) {
          return { error: retryErr instanceof Error ? retryErr.message : String(retryErr) };
        }
      } else {
        return { error: msg };
      }
    }

    // The default serviceId this path was built with (undefined if the caller passed one or the operation has none).
    const defaultServiceId =
      operation.path.includes(':serviceId') && !request.pathParams?.serviceId ? config.serviceId : undefined;

    const init: RequestInit = {
      method: operation.method,
      headers: {
        'X-Sonos-Timezone': '+01:00',
        'X-Sonos-Debug': 'use-section-text=true',
        Accept: '*/*',
        ...(request.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...request.headers,
      },
      ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
    };

    // Retry transient failures (5xx, network errors) for idempotent methods only: a blind replay of a queue
    // mutation could repeat a side effect, and its If-Match etag would not survive.
    const isIdempotent = operation.method === 'GET';

    const sent = await sendWithRetries(path, init, isIdempotent);
    if ('error' in sent) return sent;
    const { response, bodyText } = sent;

    if (response.status === 401) {
      // The gateway heals Sonos 401s itself, so this is a bad Entra token even after a refresh (the gateway
      // helper has already told the app).
      return { error: '401 Unauthorized — gateway refused the request' };
    }

    // Self-heal a bad default service: re-select and retry once. Only for requests that relied on the default
    // (discovery probes pass explicit IDs), and the retry itself can't heal again.
    if (!response.ok && !isRetry && defaultServiceId && bodyText.includes('ERROR_SERVICE_NOT_CONFIGURED')) {
      // Only clear if nobody has already replaced it, so concurrent failures coalesce onto one selection.
      if (config.serviceId === defaultServiceId) {
        config.serviceId = undefined;
        config.accountId = undefined;
      }
      await discoverServiceCredentials();
      return sonosFetch(request, true);
    }

    if (!response.ok) {
      return { error: `${response.status} ${response.statusText}${bodyText ? `: ${bodyText.slice(0, 200)}` : ''}` };
    }

    const etag = response.headers.get('etag') ?? undefined;
    if (!bodyText) return { data: null, ...(etag ? { etag } : {}) };
    try {
      return { data: JSON.parse(bodyText), ...(etag ? { etag } : {}) };
    } catch {
      return { error: `Response is not JSON (${response.status} ${response.statusText})` };
    }
  }

  // ─── Service credential discovery ──────────────────────────────────────────────

  interface ServiceCreds {
    serviceId: string;
    accountId: string;
  }

  /** Integration objects, with keys camelCase or hyphenated as the Sonos API returns them. */
  function parseIntegrationsCreds(data: unknown): ServiceCreds[] {
    const items = Array.isArray(data) ? data : data !== null && typeof data === 'object' ? [data] : [];
    const results: ServiceCreds[] = [];
    for (const item of items) {
      if (typeof item !== 'object' || item === null) continue;
      const rec: Record<string, unknown> = Object.fromEntries(Object.entries(item));
      const sid = rec['service-id'] ?? rec['serviceId'];
      const aid = rec['account-id'] ?? rec['accountId'];
      if (
        (typeof sid === 'string' || typeof sid === 'number') &&
        (typeof aid === 'string' || typeof aid === 'number')
      ) {
        results.push({ serviceId: String(sid), accountId: String(aid) });
      }
    }
    return results;
  }

  /**
   * Chooses the default music service when serviceId isn't known: lists the integration registrations, drops the
   * platform service, and keeps the first candidate whose root container browses OK. Concurrent callers share one run.
   */
  let inFlight: Promise<void> | null = null;
  function discoverServiceCredentials(): Promise<void> {
    if (config.serviceId) return Promise.resolve();
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        const r = await sonosFetch({ operationId: 'getIntegrationRegistrations' });
        if (r.error || !r.data) return;

        const candidates = parseIntegrationsCreds(r.data).filter((c) => c.serviceId !== PLATFORM_SERVICE_ID);
        // Probe in API order with explicit IDs (so the self-heal never fires for these). First root browse that works wins.
        let chosen: ServiceCreds | undefined;
        for (const c of candidates) {
          const probe = await sonosFetch({
            operationId: 'browseContainer',
            pathParams: { containerId: 'root', serviceId: c.serviceId, accountId: c.accountId },
            query: { muse2: 'true' },
          });
          if (!probe.error) {
            chosen = c;
            break;
          }
        }
        chosen ??= candidates[0];
        if (chosen) {
          config.serviceId = chosen.serviceId;
          config.accountId = chosen.accountId;
        }
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  // ─── The browse lane ───────────────────────────────────────────────────────────
  // The gateway speaks HTTP/1.1, so the browser holds six connections to it. Home's picks fire dozens of catalogue
  // browses at launch (about 1.7 s each at Sonos) and would take all six, starving everything else. At most
  // LANE_MAX browses run at once; the rest wait here, newest first (a browse the user has just asked for must not sit
  // behind background ones). Only operations named browse* (album, artist, container, playlist) go through it. The
  // retries inside sonosFetch and the service probe above call sonosFetch directly, so they never take a second slot
  // (the probe must not: browses waiting on the discovery hold slots themselves).
  const LANE_MAX = 3;
  let laneActive = 0;
  const laneWaiting: Array<() => void> = [];

  async function laneFetch(request: FetchRequest, isRetry?: boolean): Promise<FetchResponse> {
    if (!request.operationId.startsWith('browse')) return sonosFetch(request, isRetry);
    if (laneActive < LANE_MAX) laneActive++;
    else await new Promise<void>((resolve) => laneWaiting.push(resolve)); // the slot is handed over on release
    try {
      return await sonosFetch(request, isRetry);
    } finally {
      const next = laneWaiting.pop(); // newest first
      if (next) next();
      else laneActive--;
    }
  }

  return { fetch: laneFetch, discoverServiceCredentials };
}
