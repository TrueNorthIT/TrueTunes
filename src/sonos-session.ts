// The Sonos session token comes from our own Azure Function (GET /api/sonos-session), behind the Entra sign-in.
// `?refresh=1` tells the server Sonos just rejected the token it gave us, so it re-checks and logs in again if needed.

import * as telemetry from './telemetry';
import { fnFetch } from './ipc/entra';
import { singleFlight } from './single-flight';
import {
  config,
  state,
  log,
  broadcastToRenderers,
  saveSessionToken,
  clearSessionToken,
  PUBSUB_FUNCTION_URL,
} from './state';

// True once Sonos has rejected a token we held: the next request must be a refresh, not a plain read.
let rejected = false;

async function fetchToken(refresh: boolean): Promise<boolean> {
  try {
    const res = await fnFetch(`${PUBSUB_FUNCTION_URL}/api/sonos-session${refresh ? '?refresh=1' : ''}`);
    if (!res.ok) {
      // 401: no valid Entra sign-in. 502 { error: 'sonos-login-failed' }: the server could not log in to Sonos.
      console.error(`[session] /api/sonos-session ${res.status}`);
      telemetry.event('sonos_session_failed', { statusCode: res.status, refresh });
      return false;
    }
    const body = (await res.json()) as { token?: unknown };
    if (typeof body.token !== 'string' || !body.token) {
      telemetry.event('sonos_session_failed', { statusCode: res.status, refresh, reason: 'no token' });
      return false;
    }
    if (body.token !== state.sessionToken) {
      state.sessionToken = body.token;
      void saveSessionToken(body.token);
      log('[session] New Sonos session token');
      // A new token may belong to another Sonos account, so the old service choice may not apply;
      // sonosFetch and the WS bootstrap rediscover it when it's missing.
      config.serviceId = undefined;
      config.accountId = undefined;
    }
    rejected = false;
    return true;
  } catch (err) {
    console.error('[session] /api/sonos-session unreachable:', err instanceof Error ? err.message : err);
    telemetry.event('sonos_session_failed', { statusCode: 0, refresh });
    return false;
  }
}

const refreshSession = singleFlight(() => fetchToken(true));

/** Fetch the session at startup or on Retry. Asks for a refresh if Sonos rejected the last token. */
export const acquireSession = (): Promise<boolean> => (rejected ? refreshSession() : fetchToken(false));

/** Tell the renderers there is no usable Sonos session; they show the error state with Retry. */
export function signalSessionFailure(): void {
  state.authConfirmed = false;
  state.authFailed = true;
  broadcastToRenderers('auth:expired');
  broadcastToRenderers('auth:failed');
}

/** Drop the dead token and tell the user. */
function expireSession(): void {
  log('[session] Sonos session unusable');
  telemetry.event('auth_expired');
  state.sessionToken = null;
  void clearSessionToken();
  signalSessionFailure();
}

const renew = singleFlight(async (): Promise<boolean> => {
  rejected = true;
  if (await refreshSession()) return true;
  expireSession();
  return false;
});

/**
 * Sonos answered 401 to a request sent with `rejectedToken`: get a fresh token and report whether
 * the caller should retry (once). Concurrent 401s share one refresh, and one that finds the token
 * already replaced just retries. `retried` means the fresh token was rejected too: give up.
 */
export async function renewSession(rejectedToken: string | null, retried = false): Promise<boolean> {
  if (retried) {
    expireSession();
    return false;
  }
  if (state.sessionToken !== rejectedToken) return state.sessionToken !== null;
  return renew();
}
