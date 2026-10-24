// App info, persisted user config and renderer telemetry.

import { app, ipcMain, IpcMainInvokeEvent, shell } from 'electron';
import { isWebUrl } from '../nav-guard';
import * as telemetry from '../telemetry';
import { config, state, saveConfig } from '../state';
import { claimDisplayName } from './entra';
import { initPubSub } from './attribution';

export function register(): void {
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('app:isNewVersion', () => state.isNewVersion);
  // http(s) only: the renderer never needs another scheme, and shell.openExternal
  // on file: or protocol-handler URLs can launch programs.
  ipcMain.handle('app:openExternal', async (_: IpcMainInvokeEvent, url: string) => {
    if (isWebUrl(url)) await shell.openExternal(url);
  });

  ipcMain.handle('config:getDisplayName', () => config.displayName ?? null);

  ipcMain.handle(
    'config:setDisplayName',
    async (_: IpcMainInvokeEvent, name: string): Promise<{ error: string } | null> => {
      // Guard empty name (sign-out path) — skip claim check.
      if (name && config.entraOid) {
        const taken = await claimDisplayName(config.entraOid, name);
        if (taken) return { error: 'taken' };
      }
      config.displayName = name;
      telemetry.setContext({ userId: name });
      await saveConfig();
      initPubSub().catch(console.error);
      return null;
    }
  );

  ipcMain.handle('config:getQueueDockedWidth', () => config.queueDockedWidth ?? 380);
  ipcMain.handle('config:setQueueDockedWidth', async (_: IpcMainInvokeEvent, width: number) => {
    config.queueDockedWidth = width;
    await saveConfig();
  });

  ipcMain.handle('telemetry:event', (_: IpcMainInvokeEvent, name: string, props?: Record<string, string>) => {
    telemetry.event(name, props);
  });
}
