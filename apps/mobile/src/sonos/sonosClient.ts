// Ported from TrueTunes/src/main.ts (buildUrl, sonosFetch, discoverServiceCredentials).
// Platform-neutral: everything environmental is injected so this runs in Node tests and in RN.

import { BASE_URL, SESSION_COOKIE, SPOOF_UA } from './constants';
import {
  OPERATIONS,
  PLATFORM_ACCOUNT_ID,
  PLATFORM_SERVICE_ID,
  SEARCH_ACCOUNT_ID,
  SEARCH_SERVICE_ID,
} from './operations';
import type { FetchRequest, FetchResponse, SonosConfig } from './types';

const TRANSIENT_STATUSES = new Set([500, 502, 503, 504]);
const RETRY_DELAYS_MS = [250, 750];

export function buildUrl(
  operationPath: string,
  config: SonosConfig,
  pathParams: Record<string, string> = {},
  query: Record<string, string | undefined> = {},
): string {
  const defaults: Record<string, string> = {
    searchServiceId: SEARCH_SERVICE_ID,
    searchAccountId: SEARCH_ACCOUNT_ID,
    platformServiceId: PLATFORM_SERVICE_ID,
    platformAccountId: PLATFORM_ACCOUNT_ID,
  };
  for (const key of ['householdId', 'serviceId', 'accountId', 'groupId', 'queueId'] as const) {
    const value = config[key];
    if (value) defaults[key] = value;
  }
  const params = { ...defaults, ...pathParams };

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

/** "+01:00"-style offset for the X-Sonos-Timezone header (desktop hardcodes +01:00). */
export function timezoneOffset(now = new Date()): string {
  const minutes = -now.getTimezoneOffset();
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${sign}${hh}:${mm}`;
}

interface ServiceCreds {
  serviceId: string;
  accountId: string;
}

/** Sonos returns hyphenated keys (service-id, account-id); accept camelCase too. */
export function parseIntegrationsCreds(data: unknown): ServiceCreds[] {
  const items = Array.isArray(data) ? data : data !== null && typeof data === 'object' ? [data] : [];
  const results: ServiceCreds[] = [];
  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue;
    const rec = item as Record<string, unknown>;
    const sid = rec['service-id'] ?? rec['serviceId'];
    const aid = rec['account-id'] ?? rec['accountId'];
    if ((typeof sid === 'string' || typeof sid === 'number') && (typeof aid === 'string' || typeof aid === 'number')) {
      results.push({ serviceId: String(sid), accountId: String(aid) });
    }
  }
  return results;
}

export interface SonosClientDeps {
  /** Mutable, shared with the WS session; read at call time. */
  config: SonosConfig;
  getSessionToken: () => string | null;
  /** Called on a 401 after which the caller should clear the token and re-authenticate. */
  onUnauthorized: () => void;
  /** Resolves once the WS bootstrap has discovered the householdId (or gives up). Lets early calls wait instead of failing. */
  awaitHousehold?: () => Promise<void>;
  /** Called when discovery fills serviceId/accountId so the caller can persist them. */
  onConfigChanged?: () => void;
  fetchImpl?: typeof fetch;
  log?: (...args: unknown[]) => void;
  /** Telemetry hook (api_retry, api_error, auth_expired). */
  onEvent?: (name: string, props?: Record<string, string | number>) => void;
  sleep?: (ms: number) => Promise<void>;
  timezone?: () => string;
}

export interface SonosClient {
  fetch(request: FetchRequest): Promise<FetchResponse>;
  discoverServiceCredentials(): Promise<void>;
}

export function createSonosClient(deps: SonosClientDeps): SonosClient {
  const { config } = deps;
  const doFetch = deps.fetchImpl ?? fetch;
  const log = deps.log ?? (() => {});
  const emit = deps.onEvent ?? (() => {});
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const timezone = deps.timezone ?? timezoneOffset;

  let discoverInFlight: Promise<void> | null = null;

  /** Uses /integrations/registrations (only needs householdId). Coalesces concurrent callers. */
  function discoverServiceCredentials(): Promise<void> {
    if (config.serviceId) return Promise.resolve();
    if (discoverInFlight) return discoverInFlight;
    discoverInFlight = (async () => {
      try {
        const r = await sonosFetch({ operationId: 'getIntegrationRegistrations' });
        if (r.error || !r.data) {
          log('[config] getIntegrationRegistrations failed:', r.error);
          return;
        }
        // Sonos places the primary content service first (owns queue, favourites, history).
        const primary = parseIntegrationsCreds(r.data)[0];
        if (primary) {
          config.serviceId = primary.serviceId;
          config.accountId = primary.accountId;
          deps.onConfigChanged?.();
          log('[config] Using serviceId:', config.serviceId, 'accountId:', config.accountId);
        } else {
          log('[config] No service credentials found - content APIs will fail until configured');
        }
      } finally {
        discoverInFlight = null;
      }
    })();
    return discoverInFlight;
  }

  async function sonosFetch(request: FetchRequest): Promise<FetchResponse> {
    const token = deps.getSessionToken();
    if (!token) return { error: 'No session token — please log in first' };

    const operation = OPERATIONS[request.operationId];
    if (!operation) return { error: `Unknown operation: ${request.operationId}` };

    let url: string;
    try {
      url = buildUrl(operation.path, config, request.pathParams, request.query);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Screens can fire before the WS bootstrap has found the household; wait for it, then retry once.
      if (msg.includes('householdId') && !config.householdId && deps.awaitHousehold) {
        log('[api] householdId missing - waiting for WS bootstrap before retrying');
        await deps.awaitHousehold();
        // Timed out (never bootstrapped): report the original error rather than waiting again.
        if (!config.householdId) return { error: msg };
        return sonosFetch(request);
      }
      // If the only missing param is serviceId, attempt on-demand discovery and retry once.
      if (msg.includes('serviceId') && !config.serviceId) {
        log('[api] serviceId missing - attempting on-demand discovery before retrying');
        await discoverServiceCredentials();
        try {
          url = buildUrl(operation.path, config, request.pathParams, request.query);
        } catch (retryErr) {
          return { error: retryErr instanceof Error ? retryErr.message : String(retryErr) };
        }
      } else {
        return { error: msg };
      }
    }

    const headers: Record<string, string> = {
      Cookie: `${SESSION_COOKIE}=${token}`,
      'X-Sonos-Timezone': timezone(),
      'X-Sonos-Debug': 'use-section-text=true',
      Accept: '*/*',
      Referer: `${BASE_URL}/en-us/web-app`,
      'User-Agent': SPOOF_UA,
      ...(request.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...request.headers,
    };

    // Retry transient failures for idempotent methods only: POST/PATCH/DELETE can have side
    // effects, and queue mutations use If-Match etags that don't survive a blind replay.
    const isIdempotent = operation.method === 'GET';

    let response!: Response;
    let bodyText = '';
    const resHeaders: Record<string, string> = {};

    for (let attempt = 0; ; attempt++) {
      log(`[api] ${operation.method} ${url}${attempt > 0 ? ` (retry ${attempt})` : ''}`);

      let networkError: string | null = null;
      let attemptResponse: Response | null = null;
      let attemptBody = '';

      try {
        attemptResponse = await doFetch(url, {
          method: operation.method,
          headers,
          ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
        });
      } catch (err) {
        networkError = `Fetch failed: ${err instanceof Error ? err.message : String(err)}`;
      }

      if (attemptResponse) {
        try {
          attemptBody = await attemptResponse.text();
        } catch {
          /* ignore */
        }
      }

      const isTransient =
        networkError !== null || (attemptResponse !== null && TRANSIENT_STATUSES.has(attemptResponse.status));

      if (isTransient && isIdempotent && attempt < RETRY_DELAYS_MS.length) {
        emit('api_retry', {
          operationId: request.operationId,
          attempt: attempt + 1,
          statusCode: attemptResponse ? attemptResponse.status : 0,
        });
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }

      if (networkError) return { error: networkError };

      response = attemptResponse!;
      bodyText = attemptBody;
      response.headers.forEach((val, key) => {
        resHeaders[key] = val;
      });
      break;
    }

    if (response.status === 401) {
      log('[api] 401 - auth expired');
      emit('auth_expired', { operationId: request.operationId });
      deps.onUnauthorized();
      return { error: '401 Unauthorized — re-authenticating' };
    }

    if (!response.ok) {
      log(`[api] ${response.status} ${response.statusText} - ${url}\n${bodyText.slice(0, 500)}`);
      emit('api_error', { operationId: request.operationId, statusCode: response.status });
      return {
        error: `${response.status} ${response.statusText}${bodyText ? `: ${bodyText.slice(0, 200)}` : ''}`,
      };
    }

    const etag = resHeaders['etag'];
    if (!bodyText) return { data: null, ...(etag ? { etag } : {}) };

    try {
      return { data: JSON.parse(bodyText), ...(etag ? { etag } : {}) };
    } catch {
      return { error: `Response is not JSON (${response.status} ${response.statusText})` };
    }
  }

  return { fetch: sonosFetch, discoverServiceCredentials };
}
