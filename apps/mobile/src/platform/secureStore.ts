// React Native adapters over expo-secure-store (Android Keystore-backed). Replaces Electron's
// safeStorage (session token) and the plaintext config.json in userData.

import * as SecureStore from 'expo-secure-store';
import type { TokenStore } from '@truetunes/core/core/session';

const TOKEN_KEY = 'sonos.sessionToken';

export const secureTokenStore: TokenStore = {
  load: () => SecureStore.getItemAsync(TOKEN_KEY),
  save: (token) => SecureStore.setItemAsync(TOKEN_KEY, token),
  clear: () => SecureStore.deleteItemAsync(TOKEN_KEY),
};

/** Key/value store for app config. SecureStore keys allow only [A-Za-z0-9._-]. */
export const secureKeyValueStore = {
  get: (key: string) => SecureStore.getItemAsync(key),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  remove: (key: string) => SecureStore.deleteItemAsync(key),
};
