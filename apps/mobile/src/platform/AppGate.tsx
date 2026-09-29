import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RemoteProvider } from '../logic/RemoteContext';
import { colors, space, type } from '../ui/theme';
import { core, startCore } from './core';
import { SonosLogin } from './SonosLogin';

type Phase = 'booting' | 'login' | 'ready';

/**
 * Boots the core and shows the right thing: spinner while restoring the session, the Sonos
 * sign-in WebView when there is no valid session, otherwise the app. A 401 anywhere drops back
 * to sign-in via auth:expired.
 */
export function AppGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('booting');
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const offReady = core.bridge.onAuthReady(() => setPhase('ready'));
    const offExpired = core.bridge.onAuthExpired(() => setPhase('login'));
    startCore()
      .then((r) => {
        if (r === 'needs-login') setPhase('login');
      })
      .catch(() => setPhase('login'));
    // Android kills background sockets, so reconnect when the app returns.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') core.onForeground();
    });
    return () => {
      offReady();
      offExpired();
      sub.remove();
    };
  }, []);

  if (phase === 'booting') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  if (phase === 'login') {
    return (
      <View style={[styles.login, { paddingTop: insets.top }]}>
        <View style={styles.loginHeader}>
          <Text style={type.title}>Sign in to Sonos</Text>
          <Text style={type.secondary}>Use your normal Sonos account. True Tunes never sees your password.</Text>
        </View>
        <SonosLogin onToken={(token) => void core.submitSonosToken(token)} />
      </View>
    );
  }

  return <RemoteProvider>{children}</RemoteProvider>;
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  login: { flex: 1, backgroundColor: colors.bg },
  loginHeader: { padding: space.lg, gap: space.xs },
});
