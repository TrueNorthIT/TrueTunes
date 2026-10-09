import { router } from 'expo-router';
import { Check, Speaker } from 'lucide-react-native';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRemoteContext } from '../logic/RemoteContext';
import { colors, radius, space, type } from '../ui/theme';

/** Room / group picker (modal). Desktop's group switcher in the player bar. */
export default function RoomsScreen() {
  const { groups, activeGroupId, changeGroup } = useRemoteContext();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom + space.lg }]}>
      <Text style={[type.title, styles.title]}>Rooms</Text>
      <FlatList
        data={groups}
        keyExtractor={(g) => g.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={type.secondary}>No rooms found. Is your Sonos system online?</Text>}
        renderItem={({ item }) => {
          const active = item.id === activeGroupId;
          return (
            <Pressable
              style={[styles.row, active && styles.rowActive]}
              onPress={() => {
                changeGroup(item.id);
                router.back();
              }}
            >
              <Speaker size={20} color={active ? colors.accent : colors.text2} />
              <Text style={[type.body, styles.name]}>{item.name}</Text>
              {active && <Check size={20} color={colors.accent} />}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: space.lg },
  title: { marginBottom: space.lg },
  list: { gap: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: colors.bg1,
  },
  rowActive: { borderColor: colors.accent, borderWidth: 1 },
  name: { flex: 1 },
});
