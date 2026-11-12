// Same endpoints and fixed ids as the desktop app (src/state.ts).

export const BASE_URL = 'https://play.sonos.com';
export const WS_URL = 'wss://api.ws.sonos.com/websocket';
export const WS_PROTOCOL = 'v1.api.smartspeaker.audio';

// play.sonos.com rejects non-browser user agents.
export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

// YouTube Music search (platform ids, not per-account).
export const SEARCH_SERVICE_ID = '72711';
export const SEARCH_ACCOUNT_ID = '13';

// Platform-level ids for the queue, favourites and history endpoints.
export const PLATFORM_SERVICE_ID = '16751367';
export const PLATFORM_ACCOUNT_ID = '123209393';
