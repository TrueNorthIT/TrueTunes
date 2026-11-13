// The browser's `window.sonos`: everything the desktop's main process does for the renderer, reached through the
// gateway (Sonos HTTP and the WebSocket relay, our Functions under /fn, artwork under /img) with the user's Entra
// ID token. The desktop code in src/ is the source of truth; each module here names the file it mirrors.

import type { WebBridge, WebBridgeEnv } from './types';
import { channel } from './events';
import { browserStorage, createStore } from './storage';
import { createGateway } from './gateway';
import { createSonosHttp, type SonosConfig } from './sonosHttp';
import { createSonosSocket, PREFERRED_KEY } from './sonosSocket';
import { createCommands } from './commands';
import { createQueueEdits } from './reorder';
import { createFnFetch, createFunctions } from './functions';
import { createIdentity } from './identity';
import { createAttribution } from './attribution';
import { createAttributionSocket } from './attributionSocket';
import { createPresence } from './presence';
import { createImages } from './images';

const QUEUE_WIDTH_KEY = 'tt.queueDockedWidth';
const LAST_SEEN_VERSION_KEY = 'tt.lastSeenVersion';

/** http(s) only: the one kind of URL the app may send the user to. */
function isWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** A relay at `path`: the given `wss://host`, else the gateway base, else this page's own host. */
function relayUrl(socketUrl: string | undefined, base: string, path = '/sonos/ws'): string {
  const root = (
    socketUrl ??
    (/^https?:/.test(base)
      ? base.replace(/^http/, 'ws')
      : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`)
  )
    .replace(/\/+$/, '')
    .replace(/\/(sonos|pubsub)\/ws$/, '');
  return `${root}${path}`;
}

const noop = () => {};

export function createWebBridge(env: WebBridgeEnv): WebBridge {
  const { auth } = env;
  const store = createStore(env.storage ?? browserStorage());
  const base = (env.gatewayBase ?? '').replace(/\/+$/, '');
  const doFetch: typeof fetch = env.fetch ?? ((input, init) => fetch(input, init));
  const config: SonosConfig = {};

  // ─── Auth state: sticky, because React subscribes after the bridge may have started ──────────
  const authReady = channel<void>();
  const authFailed = channel<void>();
  const authExpired = channel<void>({ sticky: false });
  const entraReady = channel<EntraUser>();
  /** Signed in, the gateway accepted the token and the relay was started. */
  let authed = false;

  const signalExpired = () => {
    authed = false;
    authReady.clear();
    authExpired.emit();
  };
  /** The desktop's signalSessionFailure: no usable session, so the app shows its error state with Retry. */
  const signalFailure = () => {
    signalExpired();
    authFailed.emit();
  };

  // ─── The pieces ──────────────────────────────────────────────────────────────────────────────
  const gateway = createGateway({ auth, fetch: doFetch, base, onRefused: signalFailure, onExpired: signalExpired });
  const sonos = createSonosHttp({ gateway, config });
  const socket = createSonosSocket({
    auth,
    WebSocket: env.WebSocket ?? WebSocket,
    url: relayUrl(env.socketUrl, base),
    config,
    store,
    discoverServiceCredentials: sonos.discoverServiceCredentials,
    onExpired: signalExpired,
  });
  const fn = createFnFetch(gateway);
  const identity = createIdentity(fn, store, () => auth.user()?.oid);
  const attribution = createAttribution(fn, identity.name, (event) => liveAttribution.send(event));
  const liveAttribution = createAttributionSocket({
    auth,
    WebSocket: env.WebSocket ?? WebSocket,
    url: relayUrl(env.socketUrl, base, '/pubsub/ws'),
    name: () => identity.name() || undefined,
    onEvent: attribution.ingest,
  });
  const functions = createFunctions(fn, identity, () => auth.user()?.oid);
  const commands = createCommands(socket, config);
  const queueEdits = createQueueEdits(sonos.fetch);

  // Decided once per page load, as the desktop does at launch.
  const isNewVersion = store.get(LAST_SEEN_VERSION_KEY) !== env.version;
  if (isNewVersion) store.set(LAST_SEEN_VERSION_KEY, env.version);

  // ─── Session ─────────────────────────────────────────────────────────────────────────────────

  /** The desktop's checkGateway: does the gateway accept our token and reach Sonos? */
  async function gatewayAccepts(): Promise<boolean> {
    try {
      return (await gateway.fetch('/sonos/api/mfe'))?.ok ?? false;
    } catch {
      return false;
    }
  }

  let run: Promise<void> | null = null;
  /** The desktop's connectSonos + onAuthReady. Concurrent calls share one run. */
  function begin(): Promise<void> {
    if (run) return run;
    run = (async () => {
      try {
        const user = auth.user();
        if (!user || authed) return;

        try {
          await identity.resolve(user);
          entraReady.emit(user);
        } catch {
          /* the app still works without a registered name; the claim is retried on the next start */
        }

        if (!(await gatewayAccepts())) {
          signalFailure();
          return;
        }
        authed = true;
        authFailed.clear();
        authReady.emit();
        void attribution.refresh();
        liveAttribution.start();
        await socket.start();
      } finally {
        run = null;
      }
    })();
    return run;
  }

  let wakeBound = false;

  function stop(): void {
    socket.stop();
    liveAttribution.stop();
    authed = false;
  }

  return {
    start() {
      void begin();
      if (!wakeBound && typeof document !== 'undefined') {
        wakeBound = true;
        // visibilitychange and pageshow fire together when a phone comes back: one wake, a moment later
        let timer: ReturnType<typeof setTimeout> | undefined;
        const wake = () => {
          if (document.visibilityState !== 'visible') return;
          clearTimeout(timer);
          timer = setTimeout(() => socket.wake(), 300);
        };
        document.addEventListener('visibilitychange', wake);
        window.addEventListener('pageshow', wake);
      }
    },
    stop,

    // Auth
    onAuthReady: (cb) => authReady.on(cb),
    onAuthExpired: (cb) => authExpired.on(cb),
    onAuthFailed: (cb) => authFailed.on(cb),
    async retrySonosAuth() {
      socket.stop();
      await begin();
    },

    // Sonos over HTTP
    fetch: (request) => sonos.fetch(request),
    async setQueueId(queueId) {
      if (typeof queueId === 'string' && queueId) config.queueId = queueId;
    },
    ...queueEdits,

    // The relay
    onWsMessage: (cb) => socket.onMessage(cb),
    onWsReady: (cb) => socket.onReady(cb),
    onWsGroups: (cb) => socket.onGroups(cb),
    getActiveGroup: () => Promise.resolve(store.get(PREFERRED_KEY)),
    setGroup: (groupId) => Promise.resolve(socket.setGroup(groupId)),
    refreshPlayback: () => Promise.resolve(socket.refreshPlayback()),
    resync: () => Promise.resolve(socket.resync()),
    ...commands,

    // Identity
    getEntraUser: () => Promise.resolve(auth.user()),
    onEntraReady: (cb) => entraReady.on(cb),
    async entraSignOut() {
      identity.clear(); // before signing out: the name is stored under the signed-in account
      await auth.signOut();
      entraReady.clear();
      stop();
    },
    async entraReLogin() {
      try {
        await auth.signIn({ selectAccount: true });
      } catch (err) {
        console.error('[entra] Re-login failed:', err);
      }
    },
    getDisplayName: () => Promise.resolve(identity.name() ?? null),
    async setDisplayName(name) {
      const oid = auth.user()?.oid;
      // An empty name (the sign-out path) skips the claim.
      if (name && oid && (await identity.claim(oid, name))) return { error: 'taken' };
      identity.setName(name);
      liveAttribution.rename();
      return null;
    },

    // Attribution
    onAttributionMap: (cb) => attribution.onMap(cb),
    onAttributionEvent: (cb) => attribution.onEvent(cb),
    refreshAttribution: () => attribution.refresh(),
    publishQueued: (item) => attribution.publishQueued(item),

    // Functions
    ...functions,
    async renameUser(oldName, newName) {
      const result = await functions.renameUser(oldName, newName);
      if (result.ok) liveAttribution.rename(); // the desktop re-inits pubsub under the new name
      return result;
    },
    fetchOfficePresence: createPresence({ auth, fetch: doFetch, fn }),

    // Artwork
    fetchImage: createImages(gateway),

    // Genius is not available on the web in this release: each lookup answers "no result" without a request.
    geniusDescription: () => Promise.resolve(null),
    geniusArtist: () => Promise.resolve(null),
    geniusAlbumYear: () => Promise.resolve(null),
    geniusArtistAlbums: () => Promise.resolve([]),
    geniusAlbumAbout: () => Promise.resolve(null),

    // App
    getVersion: () => Promise.resolve(env.version),
    isNewVersion: () => Promise.resolve(isNewVersion),
    async openExternal(url) {
      if (isWebUrl(url)) window.open(url, '_blank', 'noopener,noreferrer');
    },
    getQueueDockedWidth() {
      const width = Number(store.get(QUEUE_WIDTH_KEY));
      return Promise.resolve(Number.isFinite(width) && width > 0 ? width : 380);
    },
    async setQueueDockedWidth(width) {
      store.set(QUEUE_WIDTH_KEY, String(width));
    },
    onUpdateDownloaded: (cb) => env.updates?.onWaiting(cb) ?? noop,
    installUpdate: () => env.updates?.activate() ?? Promise.resolve(),

    // Electron-only: nothing to do in a browser
    trackEvent: () => Promise.resolve(),
    minimizeWindow: () => Promise.resolve(),
    maximizeWindow: () => Promise.resolve(),
    closeWindow: () => Promise.resolve(),
    isWindowMaximized: () => Promise.resolve(false),
    onWindowMaximized: () => noop,
    openWsMonitor: () => Promise.resolve(),
    openHttpMonitor: () => Promise.resolve(),
    openDevTools: () => Promise.resolve(),
    openMiniPlayer: () => Promise.resolve(),
    closeMiniPlayer: () => Promise.resolve(),
    updateNowPlayingSmtc: () => Promise.resolve(),
  };
}
