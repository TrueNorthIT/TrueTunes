// Composition root: wires the platform-neutral modules into one object that implements the same
// `window.sonos` surface the desktop preload exposes (SonosPreload, ambient in src/types), so the
// ported hooks run unchanged. Replaces the Electron main-process glue in TrueTunes/src/main.ts
// (app.whenReady, onAuthReady, ensureEntraAuth, initPubSub and the ipcMain handlers).

import { createAzureApi } from '../office/azureApi';
import { loadConfig, saveConfig } from '../office/config';
import type { AppConfig, KeyValueStore } from '../office/config';
import { createGenius } from '../office/genius';
import { createOfficePresence } from '../office/officePresence';
import { OfficePubSub } from '../office/pubsub';
import type { AttributionEvent, AttributionMap, PubSubSocket } from '../office/pubsub';
import * as telemetry from '../office/telemetry';
import { createQueueOps } from '../sonos/queueOps';
import type { GroupInfo } from '../sonos/protocol';
import { createSonosClient } from '../sonos/sonosClient';
import { WsSession } from '../sonos/wsSession';
import type { SocketFactory, WsBroadcast, WsStatus } from '../sonos/wsSession';
import { EventHub } from './events';
import { SessionManager, validateSessionToken } from './session';
import type { TokenStore } from './session';

export interface EntraUser {
  oid: string;
  name: string;
  email: string;
}

/** Same shape as desktop's EntraAuth so a React Native implementation can drop in. */
export interface EntraProvider {
  acquireTokenSilent(): Promise<EntraUser | null>;
  acquireTokenInteractive(prompt?: string): Promise<EntraUser>;
  acquireGraphToken(scopes: string[]): Promise<string | null>;
  signOut(): Promise<void>;
}

/** Graph scope for office presence (see desktop auth-entra.ts PRESENCE_SCOPE). */
export const PRESENCE_SCOPE = 'https://graph.microsoft.com/Presence.Read.All';

export interface CorePlatform {
  tokenStore: TokenStore;
  kvStore: KeyValueStore;
  createSonosSocket: SocketFactory;
  createPubSubSocket: (url: string, protocol: string) => PubSubSocket;
  fetchImpl?: typeof fetch;
  log?: (...args: unknown[]) => void;
  appVersion: string;
  openExternal: (url: string) => Promise<void>;
  env: {
    pubsubFunctionUrl: string;
    geniusToken?: string;
    appInsightsConnectionString?: string;
  };
  /** Optional until an Android Entra implementation exists; sign-in is skipped when absent. */
  entra?: EntraProvider | null;
  /** e.g. drive a media notification from the playback state. */
  onPlaybackState?: (isPlaying: boolean) => void;
}

export type CoreEvents = {
  'auth:ready': [];
  'auth:expired': [];
  'ws:ready': [];
  'ws:groups': [GroupInfo[]];
  'ws:message': [Record<string, unknown>, unknown];
  'attribution:map': [AttributionMap];
  'attribution:event': [AttributionEvent];
  'auth:entra-ready': [EntraUser];
  'ws:status': [WsStatus];
};

const noopUnsub = () => {};

export function createCore(platform: CorePlatform) {
  const log = platform.log ?? (() => {});
  const config: AppConfig = {};
  let isNewVersion = false;

  // Same early-event buffering as desktop's preload.ts.
  const hub = new EventHub<CoreEvents>(['auth:ready', 'ws:ready', 'ws:groups', 'attribution:map', 'auth:entra-ready', 'ws:status']);

  const persist = () => saveConfig(platform.kvStore, config);

  const session = new SessionManager({
    store: platform.tokenStore,
    validate: (t) => validateSessionToken(t, platform.fetchImpl),
    log,
  });

  const client = createSonosClient({
    config,
    getSessionToken: session.getToken,
    onUnauthorized: () => void session.expire(),
    // `ws` is created just below; the closure only runs after both exist.
    awaitHousehold: () => ws.whenHousehold(),
    fetchImpl: platform.fetchImpl,
    log,
    onEvent: (n, p) => telemetry.event(n, p),
  });

  const ws = new WsSession({
    config,
    getSessionToken: session.getToken,
    createSocket: platform.createSonosSocket,
    discoverServiceCredentials: client.discoverServiceCredentials,
    broadcast: (m: WsBroadcast) => {
      if (m.channel === 'ws:message') hub.emit('ws:message', m.header, m.payload);
      else if (m.channel === 'ws:groups') hub.emit('ws:groups', m.groups);
      else hub.emit('ws:ready');
    },
    onConfigChanged: () => void persist(),
    onPlaybackState: platform.onPlaybackState,
    onStatus: (status) => hub.emit('ws:status', status),
    fetchImpl: platform.fetchImpl,
    log,
    onEvent: (n, p) => telemetry.event(n, p),
    onException: (e, p) => telemetry.exception(e, p),
  });

  const queue = createQueueOps({ client, config, log });

  const onDisplayNameChanged = async (name: string) => {
    telemetry.setContext({ userId: name });
    await persist();
    void initPubSub();
  };

  const azure = createAzureApi({
    baseUrl: platform.env.pubsubFunctionUrl,
    config,
    fetchImpl: platform.fetchImpl,
    onDisplayNameChanged,
  });

  const genius = createGenius({ getKey: () => platform.env.geniusToken, fetchImpl: platform.fetchImpl, log });

  const presence = createOfficePresence({
    baseUrl: platform.env.pubsubFunctionUrl,
    getGraphToken: () => platform.entra?.acquireGraphToken([PRESENCE_SCOPE]) ?? null,
    hasAuth: () => !!platform.entra,
    fetchImpl: platform.fetchImpl,
  });

  const pubsub = new OfficePubSub({ createSocket: platform.createPubSubSocket, fetchImpl: platform.fetchImpl, log });
  let pubsubInitialised = false;

  /** Connect Azure PubSub if a Function URL and display name are configured. */
  async function initPubSub(): Promise<void> {
    if (!platform.env.pubsubFunctionUrl || !config.displayName) return;
    if (pubsubInitialised) {
      pubsub.disconnect(); // resets its event callbacks too
      pubsubInitialised = false;
    }
    try {
      const initialMap = await pubsub.connect(config.displayName, platform.env.pubsubFunctionUrl);
      hub.emit('attribution:map', initialMap);
      pubsub.onEvent((event) => hub.emit('attribution:event', event));
      pubsubInitialised = true;
      log('[pubsub] Connected as', config.displayName);
    } catch (err) {
      log('[pubsub] Failed to connect:', (err as Error).message);
      telemetry.exception(err, { phase: 'pubsub_connect' });
    }
  }

  async function ensureEntra(forcePrompt?: string): Promise<void> {
    const entra = platform.entra;
    if (!entra) return;

    let user = forcePrompt ? null : await entra.acquireTokenSilent();
    if (!user) user = await entra.acquireTokenInteractive(forcePrompt);

    config.entraOid = user.oid;
    config.entraName = user.name;
    config.entraEmail = user.email;

    if (!config.displayName) {
      // No local display name - check Cosmos for an existing profile tied to this OID.
      config.displayName = (await azure.lookupProfileByOid(user.oid)) ?? user.name;
    }

    // Register this display name under this OID (no-op if already claimed; migrates pre-Entra users).
    azure.claimDisplayName(user.oid, config.displayName).catch(() => {});

    await persist();
    telemetry.setContext({ userId: config.displayName });
    log('[entra] Authenticated as', user.email, '->', config.displayName);
    hub.emit('auth:entra-ready', user);
  }

  session.on('ready', () => {
    void (async () => {
      telemetry.event('auth_success');
      try {
        await ensureEntra();
      } catch (err) {
        log('[entra] Auth failed:', err);
        telemetry.exception(err, { phase: 'entra_auth' });
      }
      hub.emit('auth:ready');
      ws.connect().catch((e) => log('[ws] connect failed', e));
      void initPubSub();
    })();
  });

  session.on('expired', () => {
    telemetry.event('auth_expired');
    ws.stop();
    hub.clear('auth:ready');
    hub.emit('auth:expired');
  });

  /** Boot sequence (desktop's app.whenReady): config, telemetry, then try the persisted session. */
  async function start(): Promise<'authed' | 'needs-login'> {
    await loadConfig(platform.kvStore, config);
    if (config.lastSeenVersion !== platform.appVersion) {
      isNewVersion = true;
      config.lastSeenVersion = platform.appVersion;
      await persist();
    }
    telemetry.init(platform.env.appInsightsConnectionString ?? '', platform.appVersion);
    if (config.displayName) telemetry.setContext({ userId: config.displayName });

    const result = await session.restore();
    telemetry.event('app_started', { sessionRestored: result === 'authed', appVersion: platform.appVersion });
    return result;
  }

  /** Android lifecycle: sockets die in the background, so reconnect on return to the foreground. */
  function onForeground(): void {
    if (!session.isAuthed) return;
    ws.resync();
    if (!pubsub.isConnected()) void initPubSub();
  }

  function stop(): void {
    ws.stop();
    pubsub.disconnect();
    pubsubInitialised = false;
  }

  const unsub = <K extends keyof CoreEvents>(channel: K, cb: (...a: CoreEvents[K]) => void) => hub.on(channel, cb);
  const ok = () => Promise.resolve();

  const bridge = {
    getVersion: () => Promise.resolve(platform.appVersion),
    isNewVersion: () => Promise.resolve(isNewVersion),
    openExternal: (url: string) => platform.openExternal(url),
    setQueueId: (queueId: string) => Promise.resolve(queue.setQueueId(queueId)),
    loadContent: (payload: Record<string, unknown>) => Promise.resolve(ws.loadContent(payload)),
    fetchImage: () => Promise.resolve({ error: 'fetchImage is not supported on mobile' }),
    onAuthReady: (cb: () => void) => unsub('auth:ready', cb),
    onAuthExpired: (cb: () => void) => unsub('auth:expired', cb),
    fetch: client.fetch,
    onWsMessage: (cb: (header: unknown, payload: unknown) => void) => unsub('ws:message', (h, p) => cb(h, p)),
    onWsReady: (cb: () => void) => unsub('ws:ready', cb),
    onWsGroups: (cb: (groups: unknown[]) => void) => unsub('ws:groups', (g) => cb(g)),
    getActiveGroup: () => Promise.resolve(ws.getActiveGroup()),
    setGroup: (groupId: string) => Promise.resolve(ws.setGroup(groupId)),
    setGroupVolume: (volume: number) => Promise.resolve(ws.setGroupVolume(volume)),
    refreshPlayback: () => Promise.resolve(ws.refreshPlayback()),
    resync: () => Promise.resolve(ws.resync()),
    setPlayModes: (modes: Record<string, unknown>) => Promise.resolve(ws.setPlayModes(modes)),
    play: () => Promise.resolve(ws.play()),
    pause: () => Promise.resolve(ws.pause()),
    skipNext: () => Promise.resolve(ws.skipNext()),
    skipPrev: () => Promise.resolve(ws.skipPrev()),
    skipToTrack: (trackNumber: number) => Promise.resolve(ws.skipToTrack(trackNumber)),
    seek: (positionMillis: number) => Promise.resolve(ws.seek(positionMillis)),
    reorderQueue: (fromIndices: number[], toIndex: number, queueLength: number) =>
      queue.reorder(fromIndices, toIndex, queueLength),
    removeFromQueue: (indices: number[]) => queue.remove(indices),
    clearQueue: () => queue.clear(),

    // Attribution / office presence
    getDisplayName: () => Promise.resolve(config.displayName ?? null),
    setDisplayName: (name: string) => azure.setDisplayName(name),
    getQueueDockedWidth: () => Promise.resolve(config.queueDockedWidth ?? 380),
    setQueueDockedWidth: async (width: number) => {
      config.queueDockedWidth = width;
      await persist();
    },
    publishQueued: async (item: Parameters<OfficePubSub['publishQueued']>[0]) => {
      await pubsub.publishQueued(item).catch(() => {});
      // noEcho means the socket won't echo our own event back, so surface it locally.
      hub.emit('attribution:event', {
        type: 'queued',
        eventType: item.eventType,
        user: config.displayName ?? '',
        uri: item.uri,
        trackName: item.trackName,
        artist: item.artist,
        artistId: item.artistId,
        album: item.album,
        albumId: item.albumId,
        imageUrl: item.imageUrl,
        timestamp: Date.now(),
      });
    },
    onAttributionMap: (cb: (map: AttributionMap) => void) => unsub('attribution:map', cb),
    onAttributionEvent: (cb: (event: AttributionEvent) => void) => unsub('attribution:event', cb),
    refreshAttribution: async () => {
      try {
        hub.emit('attribution:map', await pubsub.refresh());
      } catch {
        /* silent - pubsub not configured */
      }
    },
    fetchStats: azure.fetchStats,
    fetchDailyGame: azure.fetchDailyGame,
    submitGameScore: azure.submitGameScore,
    fetchGameLeaderboard: azure.fetchGameLeaderboard,
    fetchGameDates: azure.fetchGameDates,
    fetchMyScore: azure.fetchMyScore,
    fetchGameStats: azure.fetchGameStats,
    fetchRecentlyPlayed: azure.fetchRecentlyPlayed,
    fetchDjSet: azure.fetchDjSet,
    fetchOfficePresence: presence.fetchOfficePresence,
    djAutoplay: azure.djAutoplay,
    geniusDescription: genius.description,
    geniusArtist: genius.artist,
    geniusAlbumYear: genius.albumYear,
    trackEvent: (name: string, properties?: Record<string, string>) => {
      telemetry.event(name, properties);
      return ok();
    },
    fetchPlaylists: azure.fetchPlaylists,
    fetchPlaylist: azure.fetchPlaylist,
    createPlaylist: azure.createPlaylist,
    updatePlaylist: azure.updatePlaylist,
    deletePlaylist: azure.deletePlaylist,
    addTrackToPlaylist: azure.addTrackToPlaylist,
    removeTrackFromPlaylist: azure.removeTrackFromPlaylist,
    reorderPlaylistTracks: azure.reorderPlaylistTracks,
    joinPlaylist: azure.joinPlaylist,
    uploadPlaylistImage: azure.uploadPlaylistImage,
    ensureFavourites: azure.ensureFavourites,
    fetchUsers: azure.fetchUsers,
    fetchUserProfile: azure.fetchUserProfile,
    uploadProfileImage: azure.uploadProfileImage,
    renameUser: azure.renameUser,

    // Entra
    getEntraUser: (): Promise<EntraUser | null> =>
      Promise.resolve(
        config.entraOid
          ? { oid: config.entraOid, name: config.entraName ?? '', email: config.entraEmail ?? '' }
          : null,
      ),
    entraSignOut: async () => {
      await platform.entra?.signOut();
      config.entraOid = undefined;
      config.entraName = undefined;
      config.entraEmail = undefined;
      config.displayName = undefined;
      await persist();
    },
    entraReLogin: async () => {
      try {
        await ensureEntra('select_account');
      } catch (err) {
        log('[entra] Re-login failed:', err);
      }
    },
    onEntraReady: (cb: (user: EntraUser) => void) => unsub('auth:entra-ready', cb),

    // Desktop-window and auto-update concerns have no mobile equivalent.
    openWsMonitor: ok,
    openHttpMonitor: ok,
    openDevTools: ok,
    openMiniPlayer: ok,
    closeMiniPlayer: ok,
    minimizeWindow: ok,
    maximizeWindow: ok,
    closeWindow: ok,
    isWindowMaximized: () => Promise.resolve(false),
    onWindowMaximized: () => noopUnsub,
    onUpdateDownloaded: () => noopUnsub,
    installUpdate: ok,
  } satisfies SonosPreload;

  return {
    bridge,
    session,
    config,
    hub,
    start,
    stop,
    onForeground,
    /** Hand a token captured by the login WebView to the session (validates before adopting). */
    submitSonosToken: (token: string) => session.submit(token),
  };
}

export type Core = ReturnType<typeof createCore>;
