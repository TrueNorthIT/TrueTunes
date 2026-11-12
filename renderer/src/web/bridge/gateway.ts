// The one authenticated door to the gateway: every Sonos, Functions and image request goes through it.

import type { WebAuth } from './types';

export const NO_TOKEN = 'No Entra token — please sign in first';

export interface Gateway {
  /**
   * `path` is everything after the gateway base (`/sonos/api/...`, `/fn/...`, `/img?...`). Resolves null when
   * there is no token to send. A 401 is retried once with a force-refreshed token; if the gateway still refuses,
   * `onRefused` runs and the 401 response is returned. Network failures throw.
   */
  fetch(path: string, init?: RequestInit): Promise<Response | null>;
}

export function createGateway(o: {
  auth: WebAuth;
  fetch: typeof fetch;
  base: string;
  /** The token is no use: the app shows its sign-in / error state (the desktop's signalSessionFailure). */
  onRefused: () => void;
}): Gateway {
  const send = (path: string, init: RequestInit, token: string) => {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    return o.fetch(`${o.base}${path}`, { ...init, headers });
  };

  return {
    async fetch(path, init = {}) {
      const token = await o.auth.idToken();
      if (!token) return null;
      const res = await send(path, init, token);
      if (res.status !== 401) return res;

      const fresh = await o.auth.idToken({ forceRefresh: true });
      const retried = fresh ? await send(path, init, fresh) : res;
      if (retried.status === 401) o.onRefused();
      return retried;
    },
  };
}
