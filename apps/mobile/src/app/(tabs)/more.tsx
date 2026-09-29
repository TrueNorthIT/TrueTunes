import { router } from 'expo-router';
import type { Href } from 'expo-router';
import { ChevronRight, Gamepad2, LogOut, MessageSquare, Speaker, Trophy, User, Users } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRemoteContext } from '../../logic/RemoteContext';
import { useRequireDisplayName } from '../../ui/social/useRequireDisplayName';
import { useShowToast } from '../../ui/Toast';
import { colors, radius, space, type } from '../../ui/theme';

function Row({
  Icon,
  label,
  sub,
  onPress,
  danger,
}: {
  Icon: LucideIcon;
  label: string;
  sub?: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress} android_ripple={{ color: colors.bg2 }}>
      <Icon size={22} color={danger ? colors.danger : colors.text2} />
      <View style={{ flex: 1 }}>
        <Text style={[type.body, danger && { color: colors.danger }]}>{label}</Text>
        {sub ? <Text style={type.caption}>{sub}</Text> : null}
      </View>
      {!danger && <ChevronRight size={18} color={colors.text3} />}
    </Pressable>
  );
}

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const { displayName, setDisplayName } = useRemoteContext();
  const showToast = useShowToast();
  const [version, setVersion] = useState<string | null>(null);
  useRequireDisplayName();

  useEffect(() => {
    window.sonos
      .getVersion()
      .then(setVersion)
      .catch(() => setVersion(null));
  }, []);

  const openProfile = () => {
    if (displayName) router.push(`/profile/${encodeURIComponent(displayName)}` as Href);
    else router.push('/display-name');
  };

  // Mirrors desktop's onSignOut: sign out of Entra, re-login, then reload the display name.
  // Entra is not configured on Android yet, so both calls may be missing or reject.
  const signOut = async () => {
    if (typeof window.sonos.entraSignOut !== 'function') {
      showToast('Sign-out is not available on Android yet', 'error');
      return;
    }
    try {
      await window.sonos.entraSignOut();
      await window.sonos.entraReLogin();
      const name = await window.sonos.getDisplayName().catch(() => null);
      setDisplayName(name);
    } catch {
      showToast('Sign-out is not available on Android yet', 'error');
    }
  };

  const confirmSignOut = () =>
    Alert.alert('Sign out', 'Sign out of your organisation account?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingBottom: space.xxl }}
    >
      <Text style={[type.title, styles.title]}>More</Text>
      <View style={styles.group}>
        <Row Icon={Trophy} label="Leaderboard" onPress={() => router.push('/leaderboard')} />
        <Row
          Icon={Gamepad2}
          label="Queuedle"
          sub="Daily music guessing game"
          onPress={() => router.push('/queuedle')}
        />
        <Row Icon={User} label="My profile" sub={displayName ?? undefined} onPress={openProfile} />
        <Row
          Icon={Users}
          label="Switch identity"
          sub={displayName ?? 'Not set'}
          onPress={() => router.push('/display-name')}
        />
        <Row Icon={Speaker} label="Rooms" onPress={() => router.push('/rooms')} />
        <Row Icon={MessageSquare} label="Send feedback" onPress={() => router.push('/feedback')} />
      </View>
      <View style={styles.group}>
        <Row Icon={LogOut} label="Sign out" onPress={confirmSignOut} danger />
      </View>
      <Text style={[type.caption, styles.footer]}>True Tunes {version ? `v${version}` : ''}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  title: { paddingHorizontal: space.lg, marginBottom: space.md },
  group: {
    backgroundColor: colors.bg1,
    borderRadius: radius.lg,
    marginHorizontal: space.lg,
    marginBottom: space.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md + 2,
  },
  footer: { textAlign: 'center', marginTop: space.md },
});
