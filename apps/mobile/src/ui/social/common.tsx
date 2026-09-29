import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { avatarColor } from '../../logic/lib/socialFormat';
import { Art } from '../Art';
import { colors, radius, space, type } from '../theme';

/** Top bar with a back chevron, title, and optional right-side action. */
export function ScreenHeader({
  title,
  right,
  onBack,
  topInset = true,
}: {
  title: string;
  right?: ReactNode;
  onBack?: () => void;
  topInset?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: (topInset ? insets.top : 0) + space.sm }]}>
      <Pressable hitSlop={12} onPress={onBack ?? (() => router.back())} accessibilityLabel="Back" style={styles.side}>
        <ChevronLeft size={28} color={colors.text} />
      </Pressable>
      <Text style={[type.heading, styles.title]} numberOfLines={1}>
        {title}
      </Text>
      <View style={[styles.side, { alignItems: 'flex-end' }]}>{right}</View>
    </View>
  );
}

/** Pill tab strip. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.seg}>
      {options.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => onChange(o.value)}
          style={[styles.segBtn, o.value === value && styles.segActive]}
        >
          <Text style={[type.secondary, o.value === value && { color: colors.text, fontWeight: '600' }]}>
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** User avatar: profile image if present, else a coloured initial. */
export function UserAvatar({ name, uri, size }: { name: string; uri?: string | null; size: number }) {
  if (uri) return <Art uri={uri} size={size} round />;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: avatarColor(name),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: colors.text, fontSize: size * 0.42, fontWeight: '700' }}>
        {(name[0] ?? '?').toUpperCase()}
      </Text>
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={[type.heading, { marginTop: space.lg, marginBottom: space.sm }]}>{children}</Text>;
}

export function Button({
  label,
  onPress,
  disabled,
  danger,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.btn, danger && { backgroundColor: colors.danger }, disabled && { opacity: 0.4 }]}
    >
      <Text style={[type.body, { fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}

export const inputStyle = {
  backgroundColor: colors.bg2,
  color: colors.text,
  borderRadius: radius.md,
  paddingHorizontal: space.md,
  paddingVertical: space.md,
  fontSize: 16,
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: colors.border2,
} as const;

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingBottom: space.sm },
  side: { width: 56 },
  title: { flex: 1, textAlign: 'center' },
  seg: { flexDirection: 'row', gap: space.xs, backgroundColor: colors.bg1, borderRadius: radius.pill, padding: 3 },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: space.sm, borderRadius: radius.pill },
  segActive: { backgroundColor: colors.bg2 },
  btn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: space.md, alignItems: 'center' },
});
