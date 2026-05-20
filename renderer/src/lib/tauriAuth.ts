import { invoke } from '@tauri-apps/api/core';

export const tauriAuth = {
  setToken: (token: string) => invoke<boolean>('auth_set_token', { token }),
  logout: () => invoke<void>('auth_logout'),
  isLoggedIn: () => invoke<boolean>('auth_is_logged_in'),
  openLogin: () => invoke<void>('auth_open_login'),
};
