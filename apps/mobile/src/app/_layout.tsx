import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AddToQueueProvider } from '../logic/AddToQueueProvider';
import { CACHE_BUSTER, PERSIST_MAX_AGE, shouldPersistQuery } from '../logic/lib/queryPersistence';
import { AppGate } from '../platform/AppGate';
import { queryPersister } from '../platform/queryPersister';
import '../platform/core'; // installs window.sonos before any hook mounts
import { ToastProvider } from '../ui/Toast';
import { colors } from '../ui/theme';

// Desktop's defaults plus a long gcTime: restored queries are garbage-collected after gcTime, so it
// must be at least as long as the persisted maxAge or the cache empties itself between launches.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, gcTime: PERSIST_MAX_AGE } } });

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister: queryPersister,
            maxAge: PERSIST_MAX_AGE,
            buster: CACHE_BUSTER,
            dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
          }}
        >
          <ToastProvider>
            <StatusBar style="light" />
            <AppGate>
              <AddToQueueProvider>
                <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="player" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
                  <Stack.Screen
                    name="rooms"
                    options={{ presentation: 'formSheet', sheetAllowedDetents: [0.5, 0.9], sheetGrabberVisible: true }}
                  />
                </Stack>
              </AddToQueueProvider>
            </AppGate>
          </ToastProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
