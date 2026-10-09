import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { core } from '../platform/core';
import { useConnectionStatus } from '../platform/useConnectionStatus';
import { colors, radius, space, type } from './theme';

/** How long we must be disconnected before showing anything, so brief blips and startup stay quiet. */
const SHOW_AFTER_MS = 1500;

/** Floating pill shown while the Sonos connection is down or being re-established. Tap to retry. */
export function ConnectionBanner() {
  const status = useConnectionStatus();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (status === 'connected') {
      setVisible(false);
      return;
    }
    const t = setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => clearTimeout(t);
  }, [status]);

  if (!visible) return null;
  return (
    <Pressable
      style={[styles.pill, { top: insets.top + space.sm }]}
      onPress={() => core.onForeground()}
      accessibilityLabel="Reconnecting to Sonos. Tap to retry"
    >
      <ActivityIndicator size="small" color={colors.text} />
      <Text style={type.secondary}>
        {status === 'connecting' ? 'Connecting to Sonos…' : 'Sonos disconnected. Tap to retry'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.bg1,
    borderColor: colors.border2,
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 10,
    elevation: 10,
  },
});
