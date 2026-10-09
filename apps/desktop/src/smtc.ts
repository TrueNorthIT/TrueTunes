// Windows-only bridge to the native SMTC (System Media Transport Controls)
// addon (native/smtc). Exposes a small, typed, fully no-op-safe API so call
// sites never need platform guards of their own — mirrors the pattern used
// by telemetry.ts (complete no-op when the backing feature isn't available).
//
// Must be initialised as early as possible in the main process lifecycle,
// before any BrowserWindow is created — Windows only associates a published
// SMTC session with a process that has an explicit AppUserModelID set
// *before* it creates its first window/GDI object (see native/smtc/src/smtc_addon.cpp).

export type SmtcPlaybackStatus = 'playing' | 'paused' | 'stopped';
export type SmtcButtonAction = 'play' | 'pause' | 'next' | 'previous' | 'stop';

export interface SmtcMetadata {
  title?: string;
  artist?: string;
  album?: string;
  thumbnailUrl?: string;
}

export interface SmtcInitOptions {
  /** Friendly name shown in the Start Menu shortcut / SMTC display name. Defaults to "True Tunes". */
  displayName?: string;
  /** app.getAppPath() - used (unpackaged only) to build a shortcut that actually launches the app. */
  appPath?: string;
  /** app.isPackaged - when true, the shortcut points straight at the exe with no launch args. */
  isPackaged?: boolean;
}

interface SmtcNative {
  init(onButtonPressed?: (action: string) => void, options?: SmtcInitOptions): void;
  setMetadata(metadata: SmtcMetadata): void;
  setPlaybackStatus(status: SmtcPlaybackStatus): void;
  setPositionState(state: { duration: number; position: number }): void;
  shutdown(): void;
}

let native: SmtcNative | null = null;
let initialized = false;

function load(): SmtcNative | null {
  if (process.platform !== 'win32') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../native/smtc/build/Release/smtc.node') as SmtcNative;
  } catch (err) {
    console.warn('[smtc] native addon unavailable, SMTC integration disabled:', err);
    return null;
  }
}

/** Initialise the native SMTC session. Call once, as early as possible (before any window is created). */
export function init(onButtonPressed: (action: SmtcButtonAction) => void, options?: SmtcInitOptions): void {
  if (initialized) return;
  native = load();
  if (!native) return;
  try {
    native.init((action) => onButtonPressed(action as SmtcButtonAction), options);
    initialized = true;
  } catch (err) {
    console.warn('[smtc] failed to initialise native SMTC session:', err);
    native = null;
  }
}

export function setMetadata(metadata: SmtcMetadata): void {
  if (!native) return;
  try {
    native.setMetadata(metadata);
  } catch {
    /* best-effort */
  }
}

export function setPlaybackStatus(status: SmtcPlaybackStatus): void {
  if (!native) return;
  try {
    native.setPlaybackStatus(status);
  } catch {
    /* best-effort */
  }
}

export function setPositionState(duration: number, position: number): void {
  if (!native) return;
  try {
    native.setPositionState({ duration, position });
  } catch {
    /* best-effort */
  }
}

export function shutdown(): void {
  if (!native) return;
  try {
    native.shutdown();
  } catch {
    /* best-effort */
  }
  native = null;
  initialized = false;
}
