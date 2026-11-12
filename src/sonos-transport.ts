// How the main process reaches Sonos: straight to play.sonos.com / api.ws.sonos.com with a session cookie
// ('direct', the default), or through our gateway with the Entra ID token ('gateway').
// Pure and free of local and Electron imports so `npm run test:main` can exercise it (like single-flight.ts).

export type SonosVia = 'direct' | 'gateway';

const SONOS_HOST = 'play.sonos.com';
export const GATEWAY_WS_PROTOCOL = 'v1.api.smartspeaker.audio';

/**
 * The mode to use: the env override (TRUETUNES_SONOS_VIA) wins over the config, and anything else is 'gateway'.
 * 'direct' (the app holds a Sonos session and talks to Sonos itself) stays available as the fallback.
 */
export function resolveSonosVia(configured: unknown, envValue: string | undefined): SonosVia {
  const valid = (v: unknown): v is SonosVia => v === 'direct' || v === 'gateway';
  if (valid(envValue)) return envValue;
  if (valid(configured)) return configured;
  return 'gateway';
}

/** `https://play.sonos.com/api/x?y=1` → `{base}/sonos/api/x?y=1`; null for any other URL. */
export function toGatewayUrl(gatewayBase: string, url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.hostname !== SONOS_HOST || u.username || u.password) return null;
    return `${gatewayBase.replace(/\/+$/, '')}/sonos${u.pathname}${u.search}`;
  } catch {
    return null;
  }
}

export interface DirectCreds {
  sessionToken: string;
  userAgent: string;
  referer: string;
}

/** The identity headers for a Sonos HTTP request: cookie, UA and Referer direct; just the bearer via the gateway. */
export function sonosAuthHeaders(
  via: SonosVia,
  creds: { bearer: string | null; direct: DirectCreds | null }
): Record<string, string> {
  if (via === 'gateway') return creds.bearer ? { Authorization: `Bearer ${creds.bearer}` } : {};
  const d = creds.direct;
  if (!d) return {};
  return {
    Cookie: `__Secure-next-auth.session-token=${d.sessionToken}`,
    Referer: d.referer,
    'User-Agent': d.userAgent,
  };
}

/**
 * Where an image fetch goes and with what headers. `onSonosHost`: the URL may carry the Sonos session
 * (https to play.sonos.com only). Via the gateway such a URL goes to the gateway with the bearer;
 * everything else is fetched as before, with no credentials. Null when the gateway has no bearer to offer.
 */
export function sonosImageRequest(
  via: SonosVia,
  url: string,
  o: {
    onSonosHost: boolean;
    gatewayBase: string;
    bearer: string | null;
    sessionToken: string | null;
    userAgent: string;
  }
): { url: string; headers: Record<string, string> } | null {
  if (via === 'gateway' && o.onSonosHost) {
    const gw = toGatewayUrl(o.gatewayBase, url);
    return gw && o.bearer ? { url: gw, headers: { Authorization: `Bearer ${o.bearer}` } } : null;
  }
  return {
    url,
    headers: {
      'User-Agent': o.userAgent,
      ...(via === 'direct' && o.sessionToken && o.onSonosHost
        ? { Cookie: `__Secure-next-auth.session-token=${o.sessionToken}` }
        : {}),
    },
  };
}

/** `https://host` → `wss://host/sonos/ws` (http → ws, for a local dev gateway). */
export function gatewaySocketUrl(gatewayBase: string): string {
  return `${gatewayBase.replace(/\/+$/, '').replace(/^http/, 'ws')}/sonos/ws`;
}
