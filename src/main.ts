import { config as loadEnv } from 'dotenv';
loadEnv(); // loads .env from cwd (repo root) in dev; no-op if file absent

import { app, BrowserWindow, nativeImage, session, shell, Menu } from 'electron';
import { officePubSub } from './pubsub';
import { navDecision } from './nav-guard';
import * as path from 'path';
import { readFileSync } from 'fs';

// Load secrets baked in at build time — fills gaps that dotenv didn't cover (packaged app has no .env)
try {
  const baked = JSON.parse(readFileSync(path.join(__dirname, 'build-env.json'), 'utf8')) as Record<string, string>;
  for (const [k, v] of Object.entries(baked)) {
    if (v && !process.env[k]) process.env[k] = v;
  }
} catch {
  /* dev: dotenv already handled it */
}
import WebSocket from 'ws';
import * as telemetry from './telemetry';
import * as smtc from './smtc';
import {
  config,
  state,
  log,
  broadcastToRenderers,
  loadConfig,
  saveConfig,
  saveSessionToken,
  loadSessionToken,
  clearSessionToken,
  validateSessionToken,
  BASE_URL,
  SPOOF_UA,
  APP_INDEX,
  APP_URL,
} from './state';
import * as sonosApi from './sonos-api';
import { discoverServiceCredentials } from './sonos-api';
import * as sonosWs from './sonos-ws';
import { ws, wsSend, discoveredGroups, connectWebSocket, resyncRendererState } from './sonos-ws';
import { installIpcGuard } from './ipc/guard';
import * as sonosIpc from './ipc/sonos';
import * as debugIpc from './ipc/debug';
import { openDebugWindow, openHttpDebugWindow } from './ipc/debug';
import * as appIpc from './ipc/app';
import * as windowsIpc from './ipc/windows';
import * as entraIpc from './ipc/entra';
import { ensureEntraAuth } from './ipc/entra';
import * as functionsIpc from './ipc/functions';
import * as attributionIpc from './ipc/attribution';
import { initPubSub } from './ipc/attribution';
import * as imagesIpc from './ipc/images';
import * as geniusIpc from './ipc/genius';
import * as updatesIpc from './ipc/updates';

// Ensure the renderer's Media Session API (used to surface "now playing" to
// Windows System Media Transport Controls / macOS Now Playing) is wired up.
// Must be set before the app is ready.
app.commandLine.appendSwitch('enable-features', 'HardwareMediaKeyHandling,MediaSessionService');
// Our "now playing" audio element has no user gesture behind it (playback
// actually happens on the Sonos speakers) — without this switch Chromium's
// autoplay policy silently blocks the programmatic .play() call needed to
// register a Media Session with the OS.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Publish a native Windows SMTC ("Now Playing") session — this is the only
// way an Electron app can register with GlobalSystemMediaTransportControlsSessionManager;
// see native/smtc/src/smtc_addon.cpp for why. Must run before any
// BrowserWindow is created (Windows only associates the explicit
// AppUserModelID we set with sessions created before the first window).
// Button presses mirror the existing Windows taskbar thumbar handlers (see
// setThumbar) — both drive the same WS playback commands directly.
smtc.init(
  (action) => {
    const groupId = config.groupId;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    switch (action) {
      case 'play':
        wsSend(
          { namespace: 'playback', groupId, command: 'play' },
          { allowTvPauseRestore: true, deviceFeedback: 'NONE' }
        ).catch(() => {});
        break;
      case 'pause':
        // Deliberately ignored. Windows sends pause for more than the user
        // pressing pause: Teams pauses every media session on joining a call,
        // and Bluetooth headsets send pause when they connect, switch to call
        // mode or come off. Any of those would stop the shared office speakers
        // for everyone, so pausing is left to the app's own controls.
        console.log('[smtc] ignoring pause command from Windows');
        telemetry.event('SmtcPauseIgnored');
        break;
      case 'next':
        wsSend({ namespace: 'playback', groupId, command: 'skipToNextTrack' }, {}).catch(() => {});
        break;
      case 'previous':
        wsSend({ namespace: 'playback', groupId, command: 'skipBack' }, {}).catch(() => {});
        break;
    }
  },
  { displayName: 'True Tunes', appPath: app.getAppPath(), isPackaged: app.isPackaged }
);

// ─── Taskbar thumbnail buttons ───────────────────────────────────────────────

let thumbarIsPlaying = false;

function taskbarAsset(name: string): Electron.NativeImage {
  const base = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
  return nativeImage.createFromPath(path.join(base, 'assets', 'taskbar', name));
}

function setThumbar(win: BrowserWindow, isPlaying: boolean): void {
  if (process.platform !== 'win32') return;
  win.setThumbarButtons([
    {
      tooltip: 'Previous',
      icon: taskbarAsset('prev.png'),
      click() {
        const groupId = config.groupId;
        if (ws && ws.readyState === WebSocket.OPEN)
          wsSend({ namespace: 'playback', groupId, command: 'skipBack' }, {}).catch(() => {});
      },
    },
    {
      tooltip: isPlaying ? 'Pause' : 'Play',
      icon: taskbarAsset(isPlaying ? 'pause.png' : 'play.png'),
      click() {
        const groupId = config.groupId;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        const cmd = thumbarIsPlaying ? 'pause' : 'play';
        wsSend(
          { namespace: 'playback', groupId, command: cmd },
          { allowTvPauseRestore: true, deviceFeedback: 'NONE' }
        ).catch(() => {});
      },
    },
    {
      tooltip: 'Next',
      icon: taskbarAsset('next.png'),
      click() {
        const groupId = config.groupId;
        if (ws && ws.readyState === WebSocket.OPEN)
          wsSend({ namespace: 'playback', groupId, command: 'skipToNextTrack' }, {}).catch(() => {});
      },
    },
  ]);
}

function updateThumbar(isPlaying: boolean): void {
  thumbarIsPlaying = isPlaying;
  if (state.uiWin && !state.uiWin.isDestroyed()) setThumbar(state.uiWin, isPlaying);
  if (state.miniWin && !state.miniWin.isDestroyed()) setThumbar(state.miniWin, isPlaying);
  smtc.setPlaybackStatus(isPlaying ? 'playing' : 'paused');
}

// ─── App windows ──────────────────────────────────────────────────────────────

function createAuthWindow(): void {
  state.authWin = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  void state.authWin.loadURL(`${BASE_URL}`);

  // Spoof UA and capture session cookie on all play.sonos.com requests
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: [`${BASE_URL}/*`] }, (details, callback) => {
    const headers = { ...details.requestHeaders };
    headers['User-Agent'] = SPOOF_UA;

    const cookieHeader = headers['Cookie'] ?? headers['cookie'] ?? '';
    const match = cookieHeader.match(/__Secure-next-auth\.session-token=([^;]+)/);
    if (match) {
      const token = match[1];
      if (token !== state.sessionToken) {
        const isSignIn = state.sessionToken === null; // first launch or after a 401, not a cookie refresh
        state.sessionToken = token;
        void saveSessionToken(token);
        log('[auth] Session token captured:', token.slice(0, 20) + '…');
        if (isSignIn) {
          // The old service choice may belong to another account. Without a
          // householdId yet (first launch), bootstrap selects instead.
          config.serviceId = undefined;
          config.accountId = undefined;
          if (config.householdId) void discoverServiceCredentials();
        }
      }
    }

    callback({ requestHeaders: headers });
  });

  // A successful /api/content/ response confirms the session is live
  session.defaultSession.webRequest.onCompleted({ urls: [`${BASE_URL}/api/content/*`] }, (details) => {
    if (details.statusCode === 200 && state.authWin) {
      log('[auth] /api/content/ 200 — auth confirmed');
      void onAuthReady();
    }
  });

  // Inject CORS headers for two cases:
  //  1. Local Sonos devices — plain HTTP, RFC 1918 addresses
  //  2. External image CDNs (gstatic, ytimg, music.youtube.com) that don't
  //     send Access-Control-Allow-Origin, blocking the renderer's fetch().
  const IMAGE_CDN =
    /^https:\/\/(www\.gstatic\.com|music\.youtube\.com|i\.ytimg\.com|yt3\.googleusercontent\.com|lh3\.googleusercontent\.com)\//;
  session.defaultSession.webRequest.onHeadersReceived(
    {
      urls: [
        'http://*/*',
        'https://www.gstatic.com/*',
        'https://music.youtube.com/*',
        'https://i.ytimg.com/*',
        'https://yt3.googleusercontent.com/*',
        'https://lh3.googleusercontent.com/*',
      ],
    },
    (details, callback) => {
      const isLan = /^http:\/\/(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(details.url);
      const isCdn = IMAGE_CDN.test(details.url);
      if (!isLan && !isCdn) {
        callback({});
        return;
      }
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'access-control-allow-origin': ['*'],
        },
      });
    }
  );
}

async function onAuthReady(): Promise<void> {
  if (state.authConfirmed) return; // fire only once per login
  state.authConfirmed = true;
  telemetry.event('auth_success');

  state.authWin?.hide();

  try {
    await ensureEntraAuth();
  } catch (err) {
    console.error('[entra] Auth failed:', err);
    telemetry.exception(err, { phase: 'entra_auth' });
  }

  if (!state.uiWin) {
    createUIWindow();
  } else {
    state.uiWin.show();
    broadcastToRenderers('auth:ready');
  }

  connectWebSocket().catch(console.error);
  initPubSub().catch(console.error);
}

/**
 * Keep an app window on the app. A stray link (changelog markdown, lyrics
 * credits) would otherwise replace the whole UI: web links go to the system
 * browser instead, anything else is refused. Not for the auth window, which
 * navigates through the Sonos sign-in on purpose.
 */
function guardNavigation(win: BrowserWindow): void {
  win.webContents.on('will-navigate', (event) => {
    const decision = navDecision(event.url, APP_URL);
    if (decision === 'allow') return;
    event.preventDefault();
    if (decision === 'external') void shell.openExternal(event.url);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (navDecision(url, APP_URL) === 'external') void shell.openExternal(url);
    return { action: 'deny' };
  });
}

function createUIWindow(): void {
  state.uiWin = new BrowserWindow({
    width: 1280,
    height: 720,
    // 320 is the skinny side-panel floor. The full layout needs ~1144px
    // (player bar 800 + queue 280 + padding); below that the renderer collapses
    // to skinny mode (see useSkinnyMode / FULL_MIN), so we let the window shrink.
    minWidth: 320,
    minHeight: 480,
    title: `True-Tunes v${app.getVersion()}`,
    backgroundColor: '#1c1c1e',
    frame: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  state.uiWin.on('maximize', () => state.uiWin?.webContents.send('win:maximized', true));
  state.uiWin.on('unmaximize', () => state.uiWin?.webContents.send('win:maximized', false));
  setThumbar(state.uiWin, thumbarIsPlaying);
  guardNavigation(state.uiWin);

  if (app.isPackaged) {
    void state.uiWin.loadFile(APP_INDEX);
  } else {
    void state.uiWin.loadURL('http://localhost:5173');
  }

  state.uiWin.webContents.on('did-finish-load', () => {
    if (state.authConfirmed) {
      broadcastToRenderers('auth:ready');
      resyncRendererState();
    }
  });
}

function createMiniPlayerWindow(): void {
  if (state.miniWin && !state.miniWin.isDestroyed()) {
    state.miniWin.focus();
    return;
  }

  state.miniWin = new BrowserWindow({
    width: 340,
    height: 116,
    minWidth: 340,
    minHeight: 116,
    maxWidth: 340,
    maxHeight: 116,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
    },
  });

  guardNavigation(state.miniWin);

  if (app.isPackaged) {
    void state.miniWin.loadFile(APP_INDEX, { hash: '/mini' });
  } else {
    void state.miniWin.loadURL('http://localhost:5173/#/mini');
  }

  state.miniWin.webContents.on('did-finish-load', () => {
    if (!state.miniWin || state.miniWin.isDestroyed()) return;
    if (state.authConfirmed) {
      state.miniWin.webContents.send('auth:ready');
    }
    // Push current WS state without triggering a full re-subscribe
    if (discoveredGroups.length > 0) {
      state.miniWin.webContents.send('ws:ready');
      state.miniWin.webContents.send('ws:groups', discoveredGroups);
      // Re-subscribe to get a fresh playback push just for the mini window
      const groupId = config.groupId;
      if (groupId && ws && ws.readyState === WebSocket.OPEN) {
        wsSend({ namespace: 'playbackExtended', groupId, command: 'subscribe' }, {}).catch(() => {});
      }
    }
  });

  setThumbar(state.miniWin, thumbarIsPlaying);

  state.miniWin.on('closed', () => {
    state.miniWin = null;
  });
}

// ─── Wiring ───────────────────────────────────────────────────────────────────

sonosApi.init({ createAuthWindow });
sonosWs.init({ updateThumbar });

// The IPC sender check goes on first: it wraps ipcMain.handle, so only handlers
// registered after this line get it. Every module below registers through it.
installIpcGuard();

sonosIpc.register();
debugIpc.register();
appIpc.register();
windowsIpc.register({ createMiniPlayerWindow });
entraIpc.register();
functionsIpc.register();
attributionIpc.register();
imagesIpc.register();
geniusIpc.register();

// ─── Application menu ────────────────────────────────────────────────────────

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    // On macOS the first menu is always the app menu
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    { role: 'editMenu' as const },
    {
      label: 'Debug',
      submenu: [
        {
          label: 'WS Monitor',
          accelerator: 'CmdOrCtrl+Shift+W',
          click: () => openDebugWindow(),
        },
        {
          label: 'HTTP Monitor',
          accelerator: 'CmdOrCtrl+Shift+H',
          click: () => openHttpDebugWindow(),
        },
        { type: 'separator' },
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => state.uiWin?.webContents.reload(),
        },
        {
          label: 'DevTools',
          accelerator: 'CmdOrCtrl+Alt+I',
          click: () => state.uiWin?.webContents.toggleDevTools(),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

updatesIpc.register();

// ─── Process-level error handlers ────────────────────────────────────────────

process.on('uncaughtException', (err) => {
  console.error('[main] Uncaught exception:', err);
  telemetry.exception(err, { phase: 'uncaught_exception' });
  void telemetry.flush().finally(() => process.exit(1));
});

process.on('unhandledRejection', (reason) => {
  console.error('[main] Unhandled rejection:', reason);
  telemetry.exception(reason, { phase: 'unhandled_rejection' });
});

// ─── App lifecycle ────────────────────────────────────────────────────────────

void app.whenReady().then(async () => {
  if (app.isPackaged) {
    Menu.setApplicationMenu(null);
  } else {
    buildMenu();
  }
  await loadConfig();

  const currentVersion = app.getVersion();
  if (config.lastSeenVersion !== currentVersion) {
    state.isNewVersion = true;
    config.lastSeenVersion = currentVersion;
    await saveConfig();
  }

  telemetry.init(process.env.APPINSIGHTS_CONNECTION_STRING ?? '', app.getVersion());
  if (config.displayName) telemetry.setContext({ userId: config.displayName });

  session.defaultSession.setUserAgent(SPOOF_UA);
  // Nothing in the app asks for a browser permission (camera, mic, notifications, clipboard
  // read, geolocation...), so no page in this session, including the Sonos sign-in, gets one.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    log('[security] denied permission request:', permission);
    callback(false);
  });

  // Try to restore a previously saved session — skip auth window if still valid
  const storedToken = await loadSessionToken();
  if (storedToken && (await validateSessionToken(storedToken))) {
    state.sessionToken = storedToken;
    log('[auth] Restored session from storage');
    telemetry.event('app_started', { sessionRestored: true, appVersion: app.getVersion() });
    void onAuthReady();
  } else {
    if (storedToken) await clearSessionToken(); // clear invalid token
    telemetry.event('app_started', { sessionRestored: false, appVersion: app.getVersion() });
    createAuthWindow();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createAuthWindow();
  });
});

app.on('before-quit', () => {
  sonosWs.stopWebSocket();
  officePubSub.disconnect();
  smtc.shutdown();
  telemetry.event('app_quit');
  void telemetry.flush();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
