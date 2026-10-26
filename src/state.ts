// Config, constants and runtime state shared by main.ts and the modules it wires up.
// Imports nothing local, so anything can import it without a cycle.

import { app, BrowserWindow, safeStorage } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import { pathToFileURL } from 'url';

// ─── Config ──────────────────────────────────────────────────────────────────

// ─── Config ──────────────────────────────────────────────────────────────────

/** Music service credentials (persisted to userData/config.json) plus
 *  runtime identifiers discovered during each session. */
export interface AppConfig {
  /** Primary music service ID — auto-discovered from play.sonos.com requests. */
  serviceId?: string;
  /** Primary music service account ID — auto-discovered. */
  accountId?: string;
  /** Household ID — re-discovered on each WS bootstrap. */
  householdId?: string;
  /** Active group ID — session-scoped (RINCON_xxx:sessionId), re-discovered on each WS bootstrap. */
  groupId?: string;
  /** Stable coordinator RINCON ID for the preferred group — persisted across sessions. */
  preferredCoordinatorId?: string;
  /** Active queue ID (coordinator player ID) — kept in sync by the renderer. */
  queueId?: string;
  /** Display name shown on tracks this user adds to the queue. */
  displayName?: string;
  /** Entra ID object ID — stable identity tied to the org account. */
  entraOid?: string;
  /** Display name sourced from Entra — separate from the user-customisable displayName. */
  entraName?: string;
  /** Email address from Entra. */
  entraEmail?: string;
  /** Last app version the user opened — used to detect first launch on a new version. */
  lastSeenVersion?: string;
  /** Width (px) of the docked queue column. */
  queueDockedWidth?: number;
}

// YouTube Music service constants used for the nowPlaying fallback lookup.
// These are generic Sonos platform IDs, not user-specific.
export const SEARCH_SERVICE_ID = '72711';
export const SEARCH_ACCOUNT_ID = '13';

// Sonos platform-level service/account IDs used for queue, favorites, and
// history endpoints.  These are fixed for the platform — not user-specific.
export const PLATFORM_SERVICE_ID = '16751367';
export const PLATFORM_ACCOUNT_ID = '123209393';

export const PUBSUB_FUNCTION_URL = 'https://truetunes-fn.azurewebsites.net';

export const config: AppConfig = {};

function configFilePath(): string {
  return path.join(app.getPath('userData'), 'config.json');
}

export async function loadConfig(): Promise<void> {
  try {
    const raw = await fs.readFile(configFilePath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    // Only load the fields we explicitly persist (not runtime-discovered ones)
    if (typeof parsed.displayName === 'string') config.displayName = parsed.displayName;
    if (typeof parsed.entraOid === 'string') config.entraOid = parsed.entraOid;
    if (typeof parsed.entraName === 'string') config.entraName = parsed.entraName;
    if (typeof parsed.entraEmail === 'string') config.entraEmail = parsed.entraEmail;
    if (typeof parsed.lastSeenVersion === 'string') config.lastSeenVersion = parsed.lastSeenVersion;
    if (typeof parsed.preferredCoordinatorId === 'string')
      config.preferredCoordinatorId = parsed.preferredCoordinatorId;
    if (typeof parsed.queueDockedWidth === 'number') config.queueDockedWidth = parsed.queueDockedWidth;
  } catch {
    // No config file yet — use defaults
  }
}

export async function saveConfig(): Promise<void> {
  try {
    // Only persist non-sensitive, user-set fields
    const toSave: Partial<AppConfig> = {
      displayName: config.displayName,
      entraOid: config.entraOid,
      entraName: config.entraName,
      entraEmail: config.entraEmail,
      lastSeenVersion: config.lastSeenVersion,
      preferredCoordinatorId: config.preferredCoordinatorId,
      queueDockedWidth: config.queueDockedWidth,
    };
    await fs.writeFile(configFilePath(), JSON.stringify(toSave, null, 2), 'utf8');
  } catch (err) {
    console.warn('[config] Failed to save:', err);
  }
}

// ─── Session token storage ────────────────────────────────────────────────────

function sessionFilePath(): string {
  return path.join(app.getPath('userData'), 'session.enc');
}

export async function saveSessionToken(token: string): Promise<void> {
  try {
    if (!(await safeStorage.isAsyncEncryptionAvailable())) return;
    const enc = await safeStorage.encryptStringAsync(token);
    await fs.writeFile(sessionFilePath(), enc);
  } catch {
    /* ignore */
  }
}

export async function loadSessionToken(): Promise<string | null> {
  try {
    if (!(await safeStorage.isAsyncEncryptionAvailable())) return null;
    const enc = await fs.readFile(sessionFilePath());
    // Also reads tokens written by the sync encryptString (Electron 45 and earlier).
    const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(enc);
    if (shouldReEncrypt) await saveSessionToken(result);
    return result;
  } catch {
    return null;
  }
}

export async function clearSessionToken(): Promise<void> {
  try {
    await fs.unlink(sessionFilePath());
  } catch {
    /* ignore */
  }
}

export async function validateSessionToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/mfe`, {
      headers: {
        Cookie: `__Secure-next-auth.session-token=${token}`,
        'User-Agent': SPOOF_UA,
        Accept: '*/*',
        Referer: `${BASE_URL}/en-us/web-app`,
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Dev logging ─────────────────────────────────────────────────────────────

// Suppress verbose logs in production builds; errors always surface.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const log = (...args: any[]) => {
  if (!app.isPackaged) console.log(...args);
};

export const BASE_URL = 'https://play.sonos.com';
export const WS_URL = 'wss://api.ws.sonos.com/websocket';

// Intentional UA spoof — Sonos BFF rejects non-browser agents.
export const SPOOF_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

// ─── App windows ──────────────────────────────────────────────────────────────

/** Runtime state shared across modules. A plain object because an imported `let` can't be assigned from outside its module. */
export const state = {
  sessionToken: null as string | null,
  authWin: null as BrowserWindow | null,
  uiWin: null as BrowserWindow | null,
  miniWin: null as BrowserWindow | null,
  debugWin: null as BrowserWindow | null,
  httpDebugWin: null as BrowserWindow | null,
  authConfirmed: false, // prevents onAuthReady firing on every /api/content/ 200
  isNewVersion: false,
};

/** Send a channel/args pair to all live renderer windows (main + mini player). */
export function broadcastToRenderers(channel: string, ...args: unknown[]): void {
  state.uiWin?.webContents.send(channel, ...args);
  if (state.miniWin && !state.miniWin.isDestroyed()) state.miniWin.webContents.send(channel, ...args);
}

export const APP_INDEX = path.join(__dirname, '..', 'renderer', 'dist', 'index.html');
export const APP_URL = app.isPackaged ? pathToFileURL(APP_INDEX).href : 'http://localhost:5173';
