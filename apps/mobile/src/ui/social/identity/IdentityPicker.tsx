import { Check } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, UserAvatar, inputStyle } from '../common';
import { colors, space, type } from '../../theme';
import { FILTER_THRESHOLD, filterUsers, isCurrentIdentity, normaliseAvatarUrl, sortUsers } from './identityHelpers';
import type { IdentityUser } from './identityHelpers';

interface Props {
  users: IdentityUser[] | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  current: string | null | undefined;
  saving: boolean;
  onPick: (name: string) => void;
}

/** Scrollable list of existing identities with an optional filter box. */
export function IdentityList({ users, loading, error, onRetry, current, saving, onPick }: Props) {
  const [filter, setFilter] = useState('');
  const sorted = useMemo(() => sortUsers(users ?? []), [users]);
  const shown = useMemo(() => filterUsers(sorted, filter), [sorted, filter]);

  if (loading) return <ActivityIndicator color={colors.text3} style={{ margin: space.xl }} />;
  if (error) {
    return (
      <View style={{ gap: space.md, alignItems: 'center', paddingVertical: space.lg }}>
        <Text style={[type.secondary, { textAlign: 'center' }]}>Could not load the list of people.</Text>
        <Button label="Retry" onPress={onRetry} />
      </View>
    );
  }
  if (sorted.length === 0)
    return <Text style={[type.secondary, { textAlign: 'center', paddingVertical: space.lg }]}>No one here yet.</Text>;

  return (
    <View style={{ flexShrink: 1, gap: space.sm }}>
      {sorted.length > FILTER_THRESHOLD && (
        <TextInput
          style={inputStyle}
          value={filter}
          onChangeText={setFilter}
          placeholder="Filter"
          placeholderTextColor={colors.text3}
          autoCorrect={false}
          selectionColor={colors.accent}
        />
      )}
      <FlatList
        data={shown}
        keyExtractor={(u) => u.userId}
        keyboardShouldPersistTaps="handled"
        style={{ flexGrow: 0 }}
        ListEmptyComponent={
          <Text style={[type.secondary, { textAlign: 'center', padding: space.lg }]}>No matches.</Text>
        }
        renderItem={({ item }) => {
          const selected = isCurrentIdentity(item.userId, current);
          return (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.bg2 }]}
              disabled={saving}
              onPress={() => onPick(item.userId)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`I am ${item.userId}`}
            >
              <UserAvatar name={item.userId} uri={normaliseAvatarUrl(item.imageUrl)} size={40} />
              <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>
                {item.userId}
              </Text>
              {selected && <Check size={20} color={colors.accent} />}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

/** Free-text path for someone not in the list. */
export function NewIdentityForm({
  value,
  onChange,
  error,
  saving,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  error: string | null;
  saving: boolean;
  onSubmit: () => void;
}) {
  return (
    <View style={{ gap: space.md }}>
      <TextInput
        style={inputStyle}
        value={value}
        onChangeText={onChange}
        placeholder="Your name"
        placeholderTextColor={colors.text3}
        maxLength={32}
        autoFocus
        autoCorrect={false}
        onSubmitEditing={onSubmit}
      />
      {error && <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text>}
      <Button label={saving ? 'Saving...' : "Let's go"} onPress={onSubmit} disabled={!value.trim() || saving} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    borderRadius: 10,
  },
});
