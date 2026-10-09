// Mirrors the constants in TrueTunes/src/main.ts. Keep in sync until these move into a shared core package.
export const BASE_URL = 'https://play.sonos.com';
export const WS_URL = 'wss://api.ws.sonos.com/websocket';
export const WS_SUBPROTOCOL = 'v1.api.smartspeaker.audio';
export const SESSION_COOKIE = '__Secure-next-auth.session-token';

// Intentional UA spoof — the Sonos BFF rejects non-browser agents.
export const SPOOF_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';
