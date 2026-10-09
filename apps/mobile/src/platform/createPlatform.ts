import Constants from 'expo-constants';
import { Linking } from 'react-native';
import type { CorePlatform } from '../core/createCore';
import { createPubSubSocket, createSonosSocket } from './sockets';
import { secureKeyValueStore, secureTokenStore } from './secureStore';

// Not secret; same value the desktop app hardcodes.
const DEFAULT_FUNCTION_URL = 'https://truetunes-fn.azurewebsites.net';

/**
 * The real React Native platform for the core. Optional integrations come from EXPO_PUBLIC_* env
 * vars (see .env.example); like the desktop's build-env.json they are baked into the bundle, so
 * they are as exposed as any client-side value.
 */
export function createPlatform(): CorePlatform {
  return {
    tokenStore: secureTokenStore,
    kvStore: secureKeyValueStore,
    createSonosSocket,
    createPubSubSocket,
    appVersion: Constants.expoConfig?.version ?? '0.0.0',
    openExternal: (url) => Linking.openURL(url),
    log: __DEV__ ? (...a) => console.log('[core]', ...a) : undefined,
    env: {
      pubsubFunctionUrl: process.env.EXPO_PUBLIC_PUBSUB_FUNCTION_URL || DEFAULT_FUNCTION_URL,
      geniusToken: process.env.EXPO_PUBLIC_GENIUS_ACCESS_TOKEN || undefined,
      appInsightsConnectionString: process.env.EXPO_PUBLIC_APPINSIGHTS_CONNECTION_STRING || undefined,
    },
    // TODO: Entra sign-in needs an Android app registration (redirect URI) - see README.
    entra: null,
  };
}
