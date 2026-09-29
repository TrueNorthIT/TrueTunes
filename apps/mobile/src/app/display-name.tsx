import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, StyleSheet, Text, View } from 'react-native';
import { useUsers } from '../logic/hooks/useUsers';
import { useRemoteContext } from '../logic/RemoteContext';
import { IdentityList, NewIdentityForm } from '../ui/social/identity/IdentityPicker';
import { colors, space, type } from '../ui/theme';

/**
 * "Who are you?" modal. Entra sign-in is unavailable on Android, so identity is a
 * trust-based pick from the existing users, or a new free-text name.
 */
export default function DisplayNameScreen() {
  const { displayName, setDisplayName } = useRemoteContext();
  const users = useUsers(true, true);
  const [mode, setMode] = useState<'pick' | 'new'>('pick');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await window.sonos.setDisplayName(trimmed);
      if (result?.error === 'taken') setError('That name is already taken - try another.');
      else if (result?.error) setError('Could not save your name. Try again.');
      else {
        setDisplayName(trimmed);
        router.back();
      }
    } catch {
      setError('Could not save your name. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      <Stack.Screen
        options={{
          presentation: 'transparentModal',
          animation: 'fade',
          contentStyle: { backgroundColor: 'rgba(0,0,0,0.6)' },
        }}
      />
      <View style={styles.card}>
        <Text style={[type.title, { textAlign: 'center' }]}>
          {mode === 'pick' ? 'Who are you?' : 'What should we call you?'}
        </Text>
        <Text style={[type.secondary, { textAlign: 'center' }]}>
          {mode === 'pick'
            ? 'Pick your name. It shows on tracks you add to the shared queue.'
            : 'Your name shows on tracks you add to the shared queue.'}
        </Text>

        {mode === 'pick' ? (
          <>
            <IdentityList
              users={users.data}
              loading={users.isLoading}
              error={users.isError}
              onRetry={() => void users.refetch()}
              current={displayName}
              saving={saving}
              onPick={(n) => void save(n)}
            />
            {error && <Text style={{ color: colors.danger, fontSize: 13, textAlign: 'center' }}>{error}</Text>}
            <View style={styles.divider} />
            <Text
              style={[type.heading, { textAlign: 'center', color: colors.accent, paddingVertical: space.xs }]}
              onPress={() => {
                setError(null);
                setMode('new');
              }}
              accessibilityRole="button"
            >
              I'm someone new
            </Text>
          </>
        ) : (
          <>
            <NewIdentityForm
              value={value}
              onChange={(t) => {
                setValue(t);
                setError(null);
              }}
              error={error}
              saving={saving}
              onSubmit={() => void save(value)}
            />
            <Text
              style={[type.caption, { textAlign: 'center' }]}
              onPress={() => {
                setError(null);
                setMode('pick');
              }}
            >
              Back to the list
            </Text>
          </>
        )}
        <Text style={[type.caption, { textAlign: 'center' }]} onPress={() => router.back()}>
          Not now
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: space.lg },
  card: {
    backgroundColor: colors.bg1,
    borderRadius: 20,
    padding: space.xl,
    gap: space.md,
    maxHeight: '90%',
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border2, marginTop: space.sm },
});
