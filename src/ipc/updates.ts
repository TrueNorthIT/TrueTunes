// Auto-update (packaged builds only).

import { app, ipcMain, session } from 'electron';
import { autoUpdater } from 'electron-updater';
import { state } from '../state';

export function register(): void {
  if (app.isPackaged) {
    autoUpdater.autoDownload = true;

    let pendingUpdateVersion: string | null = null;

    const pollInterval = setInterval(() => void autoUpdater.checkForUpdates(), 15 * 60 * 1000);
    void autoUpdater.checkForUpdates();

    autoUpdater.once('update-available', () => clearInterval(pollInterval));

    autoUpdater.once('update-downloaded', ({ version }) => {
      pendingUpdateVersion = version;
      state.uiWin?.webContents.send('update:downloaded', version);
    });

    ipcMain.handle('update:install', async () => {
      // quitAndInstall exits without Chromium's usual shutdown, so localStorage written moments
      // ago (a poll just answered) can be lost. Flush it to disk first.
      try {
        session.defaultSession.flushStorageData();
      } catch {
        // Nothing to flush is fine; the install matters more.
      }
      autoUpdater.quitAndInstall(true, true);
    });

    app.on('browser-window-created', (_e, win) => {
      win.webContents.on('did-finish-load', () => {
        if (pendingUpdateVersion) win.webContents.send('update:downloaded', pendingUpdateVersion);
      });
    });
  }
}
