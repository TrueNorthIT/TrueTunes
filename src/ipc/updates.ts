// Auto-update (packaged builds only).

import { app, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import { state } from '../state';

export function register(): void {
  if (app.isPackaged) {
    autoUpdater.autoDownload = true;

    let pendingUpdateVersion: string | null = null;

    const pollInterval = setInterval(() => autoUpdater.checkForUpdates(), 15 * 60 * 1000);
    autoUpdater.checkForUpdates();

    autoUpdater.once('update-available', () => clearInterval(pollInterval));

    autoUpdater.once('update-downloaded', ({ version }) => {
      pendingUpdateVersion = version;
      state.uiWin?.webContents.send('update:downloaded', version);
    });

    ipcMain.handle('update:install', () => autoUpdater.quitAndInstall(true, true));

    app.on('browser-window-created', (_e, win) => {
      win.webContents.on('did-finish-load', () => {
        if (pendingUpdateVersion) win.webContents.send('update:downloaded', pendingUpdateVersion);
      });
    });
  }
}
