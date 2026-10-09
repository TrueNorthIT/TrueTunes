import { useQuery } from '@tanstack/react-query';
import { Link, router } from 'expo-router';
import { Compass } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAddToQueue } from '../../logic/AddToQueueContext';
import { useDailyGame, useMyScore } from '../../logic/hooks/useDailyGame';
import { useMyPlaylists } from '../../logic/hooks/usePlaylists';
import { useRecentlyPlayed } from '../../logic/hooks/useRecentlyPlayed';
import { useUsers } from '../../logic/hooks/useUsers';
import { browseSub, getItemArt, getName } from '../../logic/lib/itemHelpers';
import { fetchYtmSections } from '../../logic/lib/ytmSections';
import { useRemoteContext } from '../../logic/RemoteContext';
import type { SonosItem } from '../../logic/types/sonos';
import { Art } from '../../ui/Art';
import {
  ArtistCircle,
  CardRow,
  MediaRow,
  PlaylistCard,
  routeForItem,
  routeForPlaylist,
  routeForProfile,
  useItemActionSheet,
} from '../../ui/media';
import { colors, radius, space, type } from '../../ui/theme';

function open(item: SonosItem) {
  const href = routeForItem(item);
  if (href) router.push(href as never);
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { isAuthed, displayName, groups } = useRemoteContext();
  const addToQueue = useAddToQueue();
  const { show, sheet } = useItemActionSheet(displayName);

  const { data: ytm, isLoading: ytmLoading } = useQuery({
    queryKey: ['ytm-sections'],
    queryFn: fetchYtmSections,
    // Like desktop's `homeEnabled`: wait for the WS bootstrap (groups) so the household is known.
    enabled: isAuthed && groups.length > 0,
    staleTime: 10 * 60 * 1000,
  });
  const { owned, joined } = useMyPlaylists(displayName);
  const { data: colleagues = [] } = useUsers(isAuthed);

  const [selectedUser, setSelectedUser] = useState<string | undefined>();
  const {
    artistItems,
    albumItems,
    availableUsers,
    currentUserId,
    isLoading: recentLoading,
  } = useRecentlyPlayed(selectedUser);
  useEffect(() => {
    if (currentUserId && !selectedUser) setSelectedUser(currentUserId);
  }, [currentUserId, selectedUser]);

  // Desktop parity: seeing colleagues' history is unlocked by completing today's Queuedle.
  const { data: todayGame } = useDailyGame();
  const todayGameId = todayGame && 'id' in todayGame ? todayGame.id : null;
  const { data: myScore } = useMyScore(todayGameId, currentUserId);
  const users = availableUsers.length > 0 ? availableUsers : currentUserId ? [currentUserId] : [];
  const pickerLocked = users.length > 1 && !myScore?.score;

  const playlists = useMemo(
    () =>
      [...owned, ...joined].sort((a, b) => {
        if (!!b.isFavourites !== !!a.isFavourites) return b.isFavourites ? 1 : -1;
        return b.updatedAt - a.updatedAt;
      }),
    [owned, joined]
  );

  const recentEmpty = !!selectedUser && !recentLoading && albumItems.length === 0 && artistItems.length === 0;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + space.md, paddingBottom: space.xxl }}>
        <View style={styles.header}>
          <Text style={type.title}>Home</Text>
          <Link href={'/discover' as never} asChild>
            <Pressable style={styles.discover} accessibilityLabel="Discover">
              <Compass size={18} color={colors.text} />
              <Text style={type.body}>Discover</Text>
            </Pressable>
          </Link>
        </View>

        {!isAuthed ? (
          <Text style={[type.secondary, styles.msg]}>Waiting for authentication...</Text>
        ) : (
          <>
            <Section title="For You">
              <CardRow
                items={ytm?.forYou ?? []}
                isLoading={ytmLoading}
                onOpen={open}
                onAdd={(i) => void addToQueue(i)}
                onLongPress={show}
              />
            </Section>

            {colleagues.length > 0 && (
              <Section title="People">
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hrow}>
                  {colleagues.map((u) => (
                    <Pressable
                      key={u.userId}
                      style={styles.person}
                      onPress={() => router.push(routeForProfile(u.userId) as never)}
                    >
                      <Art uri={u.imageUrl} size={56} round />
                      <Text style={[type.secondary, { maxWidth: 72 }]} numberOfLines={1}>
                        {u.userId}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </Section>
            )}

            {displayName && (
              <Section title="Playlists">
                <Pressable
                  onPress={() => router.push('/create-playlist' as never)}
                  style={{
                    alignSelf: 'flex-start',
                    minHeight: 44,
                    justifyContent: 'center',
                    marginHorizontal: space.lg,
                    marginBottom: space.sm,
                    paddingHorizontal: space.md,
                    borderRadius: radius.pill,
                    backgroundColor: colors.bg2,
                  }}
                  accessibilityLabel="New playlist"
                >
                  <Text style={type.secondary}>+ New</Text>
                </Pressable>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hrow}>
                  {playlists.map((pl) => (
                    <PlaylistCard
                      key={pl.id}
                      pl={pl}
                      displayName={displayName}
                      onPress={() => router.push(routeForPlaylist(pl.id) as never)}
                    />
                  ))}
                </ScrollView>
              </Section>
            )}

            <Section title="Recently Played - Last 7 Days">
              {users.length > 1 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={[styles.hrow, { marginBottom: space.sm }]}
                >
                  {users.map((u) => (
                    <Pressable
                      key={u}
                      disabled={pickerLocked && u !== currentUserId}
                      onPress={() => setSelectedUser(u)}
                      style={[
                        styles.chip,
                        u === selectedUser && styles.chipActive,
                        pickerLocked && u !== currentUserId && { opacity: 0.4 },
                      ]}
                    >
                      <Text style={type.secondary}>{u}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
              {pickerLocked && (
                <Text style={[type.caption, styles.pad]}>
                  Complete today's Queuedle to see your colleagues' recently played.
                </Text>
              )}
              {recentLoading && <ActivityIndicator color={colors.text3} style={{ margin: space.lg }} />}
              {recentEmpty && <Text style={[type.secondary, styles.pad]}>Nothing queued in the last 7 days</Text>}
              {!recentLoading && artistItems.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={[styles.hrow, { marginBottom: space.md }]}
                >
                  {artistItems.map((a, i) => (
                    <ArtistCircle key={i} artist={a} size={80} onPress={open} onLongPress={show} />
                  ))}
                </ScrollView>
              )}
              {!recentLoading &&
                albumItems.map((item, i) => (
                  <MediaRow
                    key={i}
                    name={getName(item)}
                    artUrl={getItemArt(item) ?? item.imageUrl}
                    subtitle={browseSub(item)}
                    onPress={() => open(item)}
                    onLongPress={() => show(item)}
                    onAdd={() => void addToQueue(item)}
                  />
                ))}
            </Section>

            <Section title="New Releases">
              <CardRow
                items={ytm?.newReleases ?? []}
                isLoading={ytmLoading}
                onOpen={open}
                onAdd={(i) => void addToQueue(i)}
                onLongPress={show}
              />
            </Section>
            <Section title="Charts">
              <CardRow
                items={ytm?.charts ?? []}
                isLoading={ytmLoading}
                onOpen={open}
                onAdd={(i) => void addToQueue(i)}
                onLongPress={show}
              />
            </Section>
          </>
        )}
      </ScrollView>
      {sheet}
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ marginTop: space.lg }}>
      <Text style={[type.heading, styles.sectionTitle]}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg },
  discover: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.bg2,
  },
  msg: { textAlign: 'center', marginTop: space.xl },
  sectionTitle: { paddingHorizontal: space.lg, marginBottom: space.sm },
  hrow: { paddingHorizontal: space.lg, gap: space.md },
  pad: { paddingHorizontal: space.lg },
  person: { alignItems: 'center', gap: space.xs, minWidth: 64 },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.bg2,
  },
  chipActive: { backgroundColor: colors.accent },
});
