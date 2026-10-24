// The IPC sender check. main.ts calls installIpcGuard() before any module registers a
// handler, and every module registers through ipcMain.handle, so all of them get it.

import { app, ipcMain, IpcMainInvokeEvent } from 'electron';
import { navDecision } from '../nav-guard';
import { state, APP_URL } from '../state';

/**
 * Whether an IPC call comes from the app itself: the top frame of a window showing the app
 * (main or mini player), or, in dev only, the WS/HTTP debug monitors. Anything else that
 * reaches the preload (a page a window was navigated to, an iframe) gets nothing.
 */
function fromApp(event: IpcMainInvokeEvent): boolean {
  if (
    !app.isPackaged &&
    [state.debugWin, state.httpDebugWin].some((w) => w && !w.isDestroyed() && w.webContents === event.sender)
  ) {
    return true;
  }
  const frame = event.senderFrame;
  return !!frame && !frame.parent && navDecision(frame.url, APP_URL) === 'allow';
}

// Wrapped once, here, so every handler registered after this gets the sender check without repeating it.
export function installIpcGuard(): void {
  const registerHandler = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, listener) =>
    registerHandler(channel, (event, ...args) => {
      if (!fromApp(event)) {
        console.warn(`[security] refused IPC "${channel}" from ${event.senderFrame?.url ?? 'a destroyed frame'}`);
        throw new Error('IPC refused: not from the app');
      }
      return listener(event, ...args);
    });
}
