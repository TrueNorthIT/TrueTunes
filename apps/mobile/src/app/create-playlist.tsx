import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRemoteContext } from '../logic/RemoteContext';
import { PillButton } from '../ui/detail/DetailChrome';
import { parsePendingTrack } from '../ui/detail/detailLogic';
import { useShowToast } from '../ui/Toast';
import { colors, radius, space, type } from '../ui/theme';

/**
 * New playlist (modal). Port of desktop CreatePlaylistDialog. Optional `track` query param holds a
 * JSON PlaylistTrack to add to the new playlist (set by the "Create new playlist" sheet action).
 */
export default function CreatePlaylistScreen() {
  const params = useLocalSearchParams<{ track?: string }>();
  const pending = parsePendingTrack(params.track);
  const { displayName } = useRemoteContext();
  const queryClient = useQueryClient();
  const showToast = useShowToast();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  async function create() {
    const trimmed = name.trim();
    if (!trimmed || !displayName || busy) return;
    setBusy(true);
    setError('');
    try {
      const playlist = await window.sonos.createPlaylist(trimmed, isPublic);
      if (pending && playlist.id) await window.sonos.addTrackToPlaylist(playlist.id, { ...pending, addedBy: displayName });
      queryClient.invalidateQueries({ queryKey: ['playlists', 'owned', displayName] });
      if (playlist.id) queryClient.invalidateQueries({ queryKey: ['playlist', playlist.id] });
      showToast(`Created ${trimmed}`, 'success');
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={[styles.root, { paddingTop: space.xl, paddingBottom: insets.bottom + space.lg }]} behavior="padding">
      <Stack.Screen options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Text style={type.title}>New playlist</Text>
      {pending ? <Text style={type.secondary}>{`"${pending.trackName}" will be added.`}</Text> : null}
      <TextInput
        value={name}
        onChangeText={setName}
        onSubmitEditing={() => void create()}
        placeholder="Playlist name"
        placeholderTextColor={colors.text3}
        autoFocus
        returnKeyType="done"
        maxLength={80}
        style={styles.input}
        selectionColor={colors.accent}
      />
      <Pressable style={styles.switchRow} onPress={() => setIsPublic((v) => !v)} accessibilityRole="switch" accessibilityState={{ checked: isPublic }}>
        <Text style={[type.secondary, { flex: 1 }]}>Public: anyone can join and add tracks</Text>
        <Switch value={isPublic} onValueChange={setIsPublic} trackColor={{ true: colors.accent, false: colors.border2 }} />
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.buttons}>
        <PillButton label="Cancel" onPress={close} />
        <PillButton primary label={busy ? 'Creating…' : 'Create'} disabled={!name.trim() || busy || !displayName} onPress={() => void create()} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg1, paddingHorizontal: space.lg, gap: space.lg },
  input: { minHeight: 48, borderRadius: radius.md, backgroundColor: colors.bg2, color: colors.text, fontSize: 16, paddingHorizontal: space.md },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 },
  error: { color: colors.danger, fontSize: 13 },
  buttons: { flexDirection: 'row', gap: space.sm, justifyContent: 'flex-end' },
});
