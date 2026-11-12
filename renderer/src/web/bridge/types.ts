// The contract between the web entry (renderer/src/web/main.tsx), the browser bridge (this folder) and the
// sign-in client. Frozen while the pieces are built in parallel: change it only by agreement.

/** Entra sign-in for the browser. The real one is MSAL (auth.ts); tests pass a fake. */
export interface WebAuth {
  /**
   * Call once, before anything else: completes a redirect sign-in if this page load is the way back from
   * Microsoft, then answers with the signed-in user, or null when nobody is signed in.
   */
  init(): Promise<EntraUser | null>;
  /** Leaves the page for Microsoft's sign-in (redirect flow, never a popup). `selectAccount` forces the picker. */
  signIn(opts?: { selectAccount?: boolean }): Promise<void>;
  /** Forgets the account in this browser. Does not sign the user out of Microsoft. */
  signOut(): Promise<void>;
  /** The signed-in user, or null. Synchronous: what init() or the last silent refresh established. */
  user(): EntraUser | null;
  /**
   * A current Entra ID token (audience: this app), refreshed silently when it is within five minutes of expiry.
   * Null when signed out or when a refresh needs the user (then the app shows sign-in again).
   */
  idToken(opts?: { forceRefresh?: boolean }): Promise<string | null>;
  /** A Microsoft Graph access token for `scopes`, silently only. Null without consent: never opens a window. */
  graphToken(scopes: string[]): Promise<string | null>;
}

/** Where "a new version is ready" comes from on the web: the service worker (piece 7). */
export interface UpdateSource {
  /** `cb(version)` when a new version is waiting; fires at once if one already is. */
  onWaiting(cb: (version: string) => void): () => void;
  /** Activates the waiting version and reloads the page. */
  activate(): Promise<void>;
}

export interface WebBridgeEnv {
  auth: WebAuth;
  /** The app version baked in at build time (package.json's). */
  version: string;
  /** Prefix for gateway paths: '' in production (same origin). Paths are `${gatewayBase}/sonos/api/...`, `/fn/...`, `/img`. */
  gatewayBase?: string;
  /** `wss://host` for the relay; default derives from `location` (`wss://<host>/sonos/ws`). */
  socketUrl?: string;
  fetch?: typeof fetch;
  WebSocket?: typeof WebSocket;
  storage?: Storage;
  updates?: UpdateSource;
}

/** The browser's `window.sonos`, plus its own lifecycle. */
export interface WebBridge extends SonosPreload {
  /**
   * Starts the session for the signed-in user: resolves the display name, loads attribution, opens the relay and
   * bootstraps it. Safe to call again after a sign-in. Does nothing useful while signed out.
   */
  start(): void;
  /** Closes the relay and stops reconnecting. */
  stop(): void;
}
