// Small shared pieces for the detail screens: top bar with back button, state messages, buttons.
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, space, type } from '../theme';

export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** The root Stack has no native header, so every detail screen draws its own back bar. */
export function DetailTopBar({ title, right }: { title?: string; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + space.xs }]}>
      <Pressable onPress={goBack} hitSlop={8} style={styles.back} accessibilityLabel="Back">
        <ChevronLeft size={26} color={colors.text} />
      </Pressable>
      <Text style={[type.heading, styles.barTitle]} numberOfLines={1}>
        {title ?? ''}
      </Text>
      <View style={styles.right}>{right}</View>
    </View>
  );
}

export function Centered({ loading, message }: { loading?: boolean; message?: string }) {
  return (
    <View style={styles.centered}>
      {loading ? <ActivityIndicator color={colors.text3} /> : null}
      {message ? <Text style={[type.secondary, { textAlign: 'center' }]}>{message}</Text> : null}
    </View>
  );
}

export function PillButton({
  label,
  icon,
  onPress,
  disabled,
  primary,
  danger,
  style,
}: {
  label: string;
  icon?: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.pill,
        primary && { backgroundColor: colors.text },
        danger && { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.danger },
        (pressed || disabled) && { opacity: disabled ? 0.4 : 0.7 },
        style,
      ]}
    >
      {icon}
      <Text style={[type.body, { fontWeight: '600' }, primary && { color: colors.bg }, danger && { color: colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

/** Solid tint from an "r, g, b" dominant colour (optional: the RN sampler may return null). */
export const tintBackground = (rgb: string | null, alpha = 0.35) => (rgb ? `rgba(${rgb}, ${alpha})` : 'transparent');

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm, paddingBottom: space.xs, gap: space.xs },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  barTitle: { flex: 1 },
  right: { minWidth: 44, alignItems: 'flex-end' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },
  pill: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.bg2,
  },
});
