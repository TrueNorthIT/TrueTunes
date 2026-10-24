// Dev-only WS/HTTP monitor windows and their IPC. The isPackaged guards keep them out of the packaged app.

import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron';
import * as path from 'path';
import { state } from '../state';

// This file compiles to dist/ipc/, so the monitor pages (copied to dist/ by build:main) are one level up.
export function openDebugWindow(): void {
  if (app.isPackaged) return;
  if (state.debugWin && !state.debugWin.isDestroyed()) {
    state.debugWin.focus();
    return;
  }
  state.debugWin = new BrowserWindow({
    width: 960,
    height: 700,
    title: 'WS Monitor',
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  void state.debugWin.loadFile(path.join(__dirname, '..', 'debug-ws.html'));
  state.debugWin.on('closed', () => {
    state.debugWin = null;
  });
}

export function openHttpDebugWindow(): void {
  if (app.isPackaged) return;
  if (state.httpDebugWin && !state.httpDebugWin.isDestroyed()) {
    state.httpDebugWin.focus();
    return;
  }
  state.httpDebugWin = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'HTTP Monitor',
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  void state.httpDebugWin.loadFile(path.join(__dirname, '..', 'debug-http.html'));
  state.httpDebugWin.on('closed', () => {
    state.httpDebugWin = null;
  });
}

export function register(): void {
  ipcMain.handle('debug:openWsMonitor', () => openDebugWindow());
  ipcMain.handle('debug:openHttpMonitor', () => openHttpDebugWindow());
  ipcMain.handle('debug:openDevTools', () => {
    if (!app.isPackaged) state.uiWin?.webContents.openDevTools();
  });

  ipcMain.handle(
    'http:resend',
    async (
      _event: IpcMainInvokeEvent,
      req: { method: string; url: string; headers: Record<string, string>; body?: string }
    ) => {
      const startTs = Date.now();
      try {
        const response = await fetch(req.url, {
          method: req.method,
          headers: req.headers,
          ...(req.body ? { body: req.body } : {}),
        });
        const resHeaders: Record<string, string> = {};
        response.headers.forEach((val: string, key: string) => {
          resHeaders[key] = val;
        });
        let body = '';
        try {
          body = await response.text();
        } catch {
          /* ignore */
        }
        return {
          status: response.status,
          statusText: response.statusText,
          headers: resHeaders,
          body,
          durationMs: Date.now() - startTs,
        };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    }
  );
}
