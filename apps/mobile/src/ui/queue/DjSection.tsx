import { Disc3 } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAutoplayState } from '../../logic/AutoplayContext';
import { Art } from '../Art';
import { colors, space, type } from '../theme';
import { djBreakLabel } from './queueLogic';

/** DJ break + upcoming picks. Not queue rows: no drag, select or skip. Renders nothing without autoplay. */
export function DjSection() {
  const autoplay = useAutoplayState();
  if (!autoplay) return null;
  const { enabled, upcoming, setEnabled } = autoplay;
  return (
    <View>
      <View style={styles.break}>
        <View style={styles.line} />
        <Pressable style={styles.label} onPress={() => setEnabled(!enabled)}>
          <Disc3 size={12} color={enabled ? colors.accent : colors.text3} />
          <Text style={[type.caption, enabled && { color: colors.accent }]}>{djBreakLabel(enabled)}</Text>
        </Pressable>
        <View style={styles.line} />
      </View>
      {upcoming.length === 0 ? (
        <Text style={[type.caption, styles.empty]}>Nothing to suggest just yet.</Text>
      ) : (
        upcoming.map((t) => (
          <View key={t.uri} style={[styles.row, !enabled && { opacity: 0.5 }]}>
            <Art uri={t.imageUrl} size={44} />
            <View style={styles.text}>
              <Text style={type.body} numberOfLines={1}>{t.trackName}</Text>
              <Text style={type.secondary} numberOfLines={1}>{t.artist}</Text>
              {!!t.because && <Text style={type.caption} numberOfLines={1}>{t.because}</Text>}
            </View>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  break: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border2 },
  label: { flexDirection: 'row', alignItems: 'center', gap: space.xs, padding: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm },
  text: { flex: 1, gap: 1 },
  empty: { textAlign: 'center', padding: space.md },
});
