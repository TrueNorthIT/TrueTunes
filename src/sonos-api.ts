// Sonos BFF over HTTP (play.sonos.com): the operation registry, sonosFetch and service discovery.

import { randomUUID } from 'crypto';
import type { FetchRequest, FetchResponse } from './types';
import * as telemetry from './telemetry';
import {
  config,
  state,
  log,
  broadcastToRenderers,
  clearSessionToken,
  BASE_URL,
  SPOOF_UA,
  SEARCH_SERVICE_ID,
  SEARCH_ACCOUNT_ID,
  PLATFORM_SERVICE_ID,
  PLATFORM_ACCOUNT_ID,
} from './state';

// main.ts owns the auth window; it passes this in so this module needn't import main.
let createAuthWindow: () => void = () => {};
export function init(deps: { createAuthWindow: () => void }): void {
  createAuthWindow = deps.createAuthWindow;
}

// ─── Operation registry ───────────────────────────────────────────────────────

type HttpMethod = 'GET' | 'POST' | 'DELETE' | 'PATCH';

interface Operation {
  method: HttpMethod;
  path: string;
}

const OPERATIONS: Record<string, Operation> = {
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

// ─── URL builder ──────────────────────────────────────────────────────────────

function buildUrl(
  operationPath: string,
  pathParams: Record<string, string> = {},
  query: Record<string, string | undefined> = {}
): string {
  const configDefaults: Record<string, string> = {};
  if (config.householdId) configDefaults['householdId'] = config.householdId;
  if (config.serviceId) configDefaults['serviceId'] = config.serviceId;
  if (config.accountId) configDefaults['accountId'] = config.accountId;
  configDefaults['searchServiceId'] = SEARCH_SERVICE_ID;
  configDefaults['searchAccountId'] = SEARCH_ACCOUNT_ID;
  configDefaults['platformServiceId'] = PLATFORM_SERVICE_ID;
  configDefaults['platformAccountId'] = PLATFORM_ACCOUNT_ID;
  if (config.groupId) configDefaults['groupId'] = config.groupId;
  if (config.queueId) configDefaults['queueId'] = config.queueId;

  const params: Record<string, string> = { ...configDefaults, ...pathParams };

  const urlPath = operationPath.replace(/:([a-zA-Z]+)/g, (_, key: string) => {
    if (!(key in params)) throw new Error(`Missing path param: ${key}`);
    return encodeURIComponent(params[key]);
  });

  const qs = Object.entries(query)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  return `${BASE_URL}${urlPath}${qs ? `?${qs}` : ''}`;
}

// ─── HTTP fetch helper ────────────────────────────────────────────────────────

export async function sonosFetch(request: FetchRequest, isRetry = false): Promise<FetchResponse> {
  if (!state.sessionToken) {
    return { error: 'No session token — please log in first' };
  }

  const operation = OPERATIONS[request.operationId];
  if (!operation) {
    return { error: `Unknown operation: ${request.operationId}` };
  }

  let url: string;
  try {
    url = buildUrl(operation.path, request.pathParams, request.query);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // If the only missing param is serviceId, attempt on-demand discovery and retry once
    if (msg.includes('serviceId') && !config.serviceId) {
      log('[api] serviceId missing — attempting on-demand discovery before retrying');
      await discoverServiceCredentials();
      try {
        url = buildUrl(operation.path, request.pathParams, request.query);
      } catch (retryErr) {
        return { error: retryErr instanceof Error ? retryErr.message : String(retryErr) };
      }
    } else {
      return { error: msg };
    }
  }

  // The default serviceId this URL was built with (undefined if the caller
  // passed one explicitly or the operation has none) — used by the self-heal.
  const defaultServiceId =
    operation.path.includes(':serviceId') && !request.pathParams?.serviceId ? config.serviceId : undefined;

  // Build headers once so we can log them before sending
  const reqHeaders: Record<string, string> = {
    Cookie: `__Secure-next-auth.session-token=${state.sessionToken}`,
    'X-Sonos-Timezone': '+01:00',
    'X-Sonos-Debug': 'use-section-text=true',
    Accept: '*/*',
    Referer: `${BASE_URL}/en-us/web-app`,
    'User-Agent': SPOOF_UA,
    ...(request.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...request.headers,
  };

  // Retry transient failures (5xx, network errors) for idempotent methods only.
  // Non-idempotent methods (POST/PUT/PATCH/DELETE) are never retried — they can
  // have side effects, and queue mutations use If-Match etags that don't survive
  // a blind replay.
  const isIdempotent = operation.method === 'GET';
  const TRANSIENT_STATUSES = new Set([500, 502, 503, 504]);
  const RETRY_DELAYS_MS = [250, 750];

  let response!: Response;
  let bodyText = '';
  let resHeaders: Record<string, string> = {};

  for (let attempt = 0; ; attempt++) {
    const reqId = randomUUID();
    const startTs = Date.now();

    state.httpDebugWin?.webContents.send('http:req', {
      id: reqId,
      ts: startTs,
      operationId: request.operationId,
      method: operation.method,
      url,
      headers: reqHeaders,
      body: request.body !== undefined ? JSON.stringify(request.body) : undefined,
    });

    log(`[api] ${operation.method} ${url}${attempt > 0 ? ` (retry ${attempt})` : ''}`);

    let networkError: string | null = null;
    let attemptResponse: Response | null = null;
    let attemptBodyText = '';
    const attemptHeaders: Record<string, string> = {};

    try {
      attemptResponse = await fetch(url, {
        method: operation.method,
        headers: reqHeaders,
        ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
      });
    } catch (err) {
      networkError = `Fetch failed: ${err instanceof Error ? err.message : String(err)}`;
      state.httpDebugWin?.webContents.send('http:res', {
        id: reqId,
        status: 0,
        statusText: 'Network Error',
        headers: {},
        body: networkError,
        durationMs: Date.now() - startTs,
      });
    }

    if (attemptResponse) {
      attemptResponse.headers.forEach((val: string, key: string) => {
        attemptHeaders[key] = val;
      });
      try {
        attemptBodyText = await attemptResponse.text();
      } catch {
        /* ignore */
      }
      state.httpDebugWin?.webContents.send('http:res', {
        id: reqId,
        status: attemptResponse.status,
        statusText: attemptResponse.statusText,
        headers: attemptHeaders,
        body: attemptBodyText,
        durationMs: Date.now() - startTs,
      });
    }

    const isTransient =
      networkError !== null || (attemptResponse !== null && TRANSIENT_STATUSES.has(attemptResponse.status));

    if (isTransient && isIdempotent && attempt < RETRY_DELAYS_MS.length) {
      telemetry.event('api_retry', {
        operationId: request.operationId,
        attempt: attempt + 1,
        statusCode: attemptResponse ? attemptResponse.status : 0,
      });
      await new Promise<void>((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      continue;
    }

    if (networkError) return { error: networkError };

    response = attemptResponse!;
    bodyText = attemptBodyText;
    resHeaders = attemptHeaders;
    break;
  }

  if (response.status === 401) {
    log('[api] 401 — auth expired, re-showing auth window');
    telemetry.event('auth_expired', { operationId: request.operationId });
    state.authConfirmed = false;
    state.sessionToken = null;
    void clearSessionToken();
    broadcastToRenderers('auth:expired');
    if (state.authWin) {
      state.authWin.show();
    } else {
      createAuthWindow();
    }
    return { error: '401 Unauthorized — re-authenticating' };
  }

  // Self-heal a bad default service: re-select and retry once. Only for
  // requests that relied on config.serviceId (discovery probes pass explicit
  // IDs, so they never get here), and the retry itself can't heal again.
  if (!response.ok && !isRetry && defaultServiceId && bodyText.includes('ERROR_SERVICE_NOT_CONFIGURED')) {
    log(`[config] serviceId ${defaultServiceId} not configured (${request.operationId}) — re-selecting service`);
    // Only clear if nobody has already replaced it, so concurrent failures
    // coalesce onto one selection instead of discarding a fresh choice.
    if (config.serviceId === defaultServiceId) {
      config.serviceId = undefined;
      config.accountId = undefined;
    }
    await discoverServiceCredentials();
    return sonosFetch(request, true);
  }

  if (!response.ok) {
    console.error(`[api] ${response.status} ${response.statusText} — ${url}\n${bodyText.slice(0, 500)}`);
    telemetry.event('api_error', { operationId: request.operationId, statusCode: response.status });
    return {
      error: `${response.status} ${response.statusText}${bodyText ? `: ${bodyText.slice(0, 200)}` : ''}`,
    };
  }

  const etag = resHeaders['etag'] ?? resHeaders['ETag'];

  if (!bodyText) return { data: null, ...(etag ? { etag } : {}) };

  try {
    return { data: JSON.parse(bodyText), ...(etag ? { etag } : {}) };
  } catch {
    return { error: `Response is not JSON (${response.status} ${response.statusText})` };
  }
}

// ─── Service credential discovery ────────────────────────────────────────────

interface ServiceCreds {
  serviceId: string;
  accountId: string;
}

/** Parse a flat array of integration objects (keys may be camelCase OR
 *  hyphenated as the Sonos API returns them). Returns all found pairs. */
function parseIntegrationsCreds(data: unknown): ServiceCreds[] {
  const items = Array.isArray(data) ? data : data !== null && typeof data === 'object' ? [data] : [];
  const results: ServiceCreds[] = [];
  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue;
    const rec = item as Record<string, unknown>;
    // Sonos returns hyphenated keys: service-id, account-id
    const sid = rec['service-id'] ?? rec['serviceId'];
    const aid = rec['account-id'] ?? rec['accountId'];
    if ((typeof sid === 'string' || typeof sid === 'number') && (typeof aid === 'string' || typeof aid === 'number')) {
      results.push({ serviceId: String(sid), accountId: String(aid) });
    }
  }
  return results;
}

/** Chooses the default music service when serviceId isn't in config: called
 *  at bootstrap, after a new sign-in, and lazily from sonosFetch. Lists
 *  /integrations/registrations (only needs householdId), drops the platform
 *  service, and keeps the first candidate whose root container browses OK.
 *  Coalesces concurrent callers onto a single in-flight request. */
let _discoverInFlight: Promise<void> | null = null;
export function discoverServiceCredentials(): Promise<void> {
  if (config.serviceId) return Promise.resolve();
  if (_discoverInFlight) return _discoverInFlight;
  _discoverInFlight = (async () => {
    try {
      const r = await sonosFetch({ operationId: 'getIntegrationRegistrations' });
      if (r.error || !r.data) {
        log('[config] getIntegrationRegistrations failed:', r.error);
        return;
      }

      const candidates = parseIntegrationsCreds(r.data).filter((c) => c.serviceId !== PLATFORM_SERVICE_ID);
      log(
        '[config] Candidate services:',
        candidates.map((c) => `${c.serviceId}/${c.accountId}`)
      );

      // Probe in API order with explicit IDs (so sonosFetch's self-heal never
      // fires for these). First root browse that succeeds wins.
      let chosen: ServiceCreds | undefined;
      let reason = 'root browse OK';
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
        log(`[config] Probe ${c.serviceId}/${c.accountId} failed: ${probe.error.slice(0, 160)}`);
      }
      if (!chosen && candidates[0]) {
        chosen = candidates[0];
        reason = 'no probe succeeded, falling back to first candidate';
      }

      if (chosen) {
        config.serviceId = chosen.serviceId;
        config.accountId = chosen.accountId;
        log(`[config] Using serviceId ${chosen.serviceId}/${chosen.accountId} (${reason})`);
      } else {
        log('[config] No service credentials found — content APIs will fail until configured');
      }
    } finally {
      _discoverInFlight = null;
    }
  })();
  return _discoverInFlight;
}
