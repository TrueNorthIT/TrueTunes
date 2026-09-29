import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { feedbackIssueUrl } from '../logic/lib/socialFormat';
import { useRemoteContext } from '../logic/RemoteContext';
import { Button, ScreenHeader, Segmented, inputStyle } from '../ui/social/common';
import { colors, space, type } from '../ui/theme';

/**
 * Feedback. Desktop posts a GitHub issue using a bundled PAT (VITE_GITHUB_PAT) via fetch; there is
 * no window.sonos backend for it and a PAT must not ship in a mobile bundle, so this opens a
 * prefilled GitHub "new issue" page through window.sonos.openExternal instead.
 */
export default function FeedbackScreen() {
  const { displayName } = useRemoteContext();
  const [kind, setKind] = useState<'bug' | 'feature'>('bug');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');

  const submit = () => {
    void window.sonos.openExternal(feedbackIssueUrl(kind, title, desc, displayName));
    router.back();
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      <Stack.Screen options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <ScreenHeader title="Send feedback" />
      <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: 'bug', label: 'Bug' },
            { value: 'feature', label: 'Feature request' },
          ]}
        />
        <TextInput
          style={inputStyle}
          placeholder="Title"
          placeholderTextColor={colors.text3}
          value={title}
          onChangeText={setTitle}
          maxLength={120}
        />
        <TextInput
          style={[inputStyle, { minHeight: 140, textAlignVertical: 'top' }]}
          placeholder="What happened / what would you like?"
          placeholderTextColor={colors.text3}
          value={desc}
          onChangeText={setDesc}
          multiline
        />
        <Button label="Continue on GitHub" onPress={submit} disabled={!title.trim()} />
        <View>
          <Text style={type.caption}>This opens a prefilled GitHub issue in your browser.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  pad: { padding: space.lg, gap: space.md },
});
