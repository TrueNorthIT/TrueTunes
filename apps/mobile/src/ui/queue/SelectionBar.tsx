import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, space, type } from '../theme';
import { selectionLabel } from './queueLogic';

export function SelectionBar({
  count, onRemove, onClear, onCancel,
}: { count: number; onRemove: () => void; onClear: () => void; onCancel: () => void }) {
  return (
    <View style={styles.bar}>
      <Text style={[type.secondary, styles.label]}>{selectionLabel(count)}</Text>
      <Pressable style={styles.btn} onPress={onCancel}><Text style={type.body}>Done</Text></Pressable>
      <Pressable style={styles.btn} onPress={onClear}><Text style={[type.body, { color: colors.danger }]}>Clear</Text></Pressable>
      <Pressable
        style={[styles.btn, styles.remove, count === 0 && { opacity: 0.4 }]}
        disabled={count === 0}
        onPress={onRemove}
      >
        <Text style={[type.body, { fontWeight: '600' }]}>Remove</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md,
    backgroundColor: colors.bg1, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth,
  },
  label: { flex: 1 },
  btn: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.md },
  remove: { backgroundColor: colors.danger },
});
