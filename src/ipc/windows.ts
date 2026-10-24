// Window chrome (the frameless main window's buttons) and the mini player.

import { ipcMain } from 'electron';
import { state } from '../state';

export function register({ createMiniPlayerWindow }: { createMiniPlayerWindow: () => void }): void {
  ipcMain.handle('win:minimize', () => {
    state.uiWin?.minimize();
  });
  ipcMain.handle('win:maximize', () => {
    if (state.uiWin?.isMaximized()) state.uiWin.unmaximize();
    else state.uiWin?.maximize();
  });
  ipcMain.handle('win:close', () => {
    state.uiWin?.close();
  });
  ipcMain.handle('win:is-maximized', () => state.uiWin?.isMaximized() ?? false);

  ipcMain.handle('mini:open', () => createMiniPlayerWindow());
  ipcMain.handle('mini:close', () => {
    state.miniWin?.close();
    state.miniWin = null;
  });
}
