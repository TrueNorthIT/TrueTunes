import { router } from 'expo-router';
import { ChevronLeft, ListPlus, RefreshCw } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAddToQueue } from '../logic/AddToQueueContext';
import { useDjDiscoveries } from '../logic/hooks/useDjDiscoveries';
import { useDjSet } from '../logic/hooks/useDjSet';
import { useOfficePresence } from '../logic/hooks/useOfficePresence';
import { useUsers } from '../logic/hooks/useUsers';
import { useRemoteContext } from '../logic/RemoteContext';
import type { SonosItem } from '../logic/types/sonos';
import { Art } from '../ui/Art';
import { AddButton } from '../ui/media';
import { SwipeRow } from '../ui/SwipeRow';
import { colors, radius, space, type } from '../ui/theme';

/** DJ picks arrive as bare ids; the queue path wants a Sonos item (port of desktop toSonosItem). */
function toSonosItem(track: DjTrack): SonosItem {
  return {
    title: track.trackName,
    type: 'ITEM_TRACK',
    subtitle: track.artist,
    imageUrl: track.imageUrl,
    resource: {
      type: 'TRACK',
      id: { objectId: track.uri, serviceId: track.serviceId ?? '', accountId: track.accountId ?? '' },
    },
  } as SonosItem;
}

interface Pick {
  uri: string;
  trackName: string;
  artist: string;
  imageUrl?: string;
  because: string;
  item: SonosItem;
}

type Mode = 'familiar' | 'discover';

export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const { displayName } = useRemoteContext();
  const addToQueue = useAddToQueue();
  const { data: users } = useUsers(true, true);
  const { data: presence } = useOfficePresence();
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>('discover');

  // Stable primitive key: presence array identity changes every poll (see desktop comment).
  const roomKey = (presence?.inOffice ?? []).join(',');
  const opts = useMemo(
    () => ({ users: selected.length ? selected : roomKey ? roomKey.split(',') : [], limit: 25 }),
    [selected, roomKey]
  );
  const { data, isLoading, isFetching, refetch } = useDjSet(opts);
  const { discoveries, isLoading: loadingNew } = useDjDiscoveries(data?.artists, mode === 'discover');

  const picks: Pick[] =
    mode === 'discover'
      ? discoveries.map((d) => ({
          uri: d.track.id.objectId ?? '',
          trackName: d.track.title,
          artist: d.artist,
          imageUrl: d.track.artUrl ?? undefined,
          because: d.because,
          item: d.track.raw,
        }))
      : (data?.tracks ?? []).map((t) => ({
          uri: t.uri,
          trackName: t.trackName,
          artist: t.artist,
          imageUrl: t.imageUrl,
          because: t.because,
          item: toSonosItem(t),
        }));

  const busy = isLoading || (mode === 'discover' && loadingNew);
  const toggle = (id: string) => setSelected((p) => (p.includes(id) ? p.filter((u) => u !== id) : [...p, id]));
  const inRoom = new Set(presence?.inOffice ?? []);

  const header = (
    <View style={{ gap: space.md, paddingBottom: space.md }}>
      <Text style={[type.secondary, styles.pad]}>
        Music for whoever is in the room, from what the office actually plays. Picks are scored so the least keen
        listener still gets a say.
      </Text>
      <View style={[styles.actions, styles.pad]}>
        {(['discover', 'familiar'] as Mode[]).map((m) => (
          <Pressable key={m} onPress={() => setMode(m)} style={[styles.pill, mode === m && styles.pillActive]}>
            <Text style={type.secondary}>{m === 'discover' ? 'New music' : 'Favourites'}</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => refetch()} disabled={isFetching} style={styles.pill} accessibilityLabel="Refresh">
          <RefreshCw size={16} color={colors.text2} />
        </Pressable>
        <Pressable
          disabled={picks.length === 0}
          onPress={() => picks.forEach((p) => void addToQueue(p.item, -1, { attribute: false }))}
          style={[styles.pill, styles.pillActive, picks.length === 0 && { opacity: 0.4 }]}
        >
          <ListPlus size={16} color={colors.text} />
          <Text style={type.secondary}>Queue all{picks.length ? ` (${picks.length})` : ''}</Text>
        </Pressable>
      </View>
      <Text style={[type.caption, styles.pad]}>
        Playing for
        {selected.length === 0
          ? ` - ${inRoom.size ? `in the office (${inRoom.size})` : 'the whole office'}; tap names to narrow`
          : ''}
      </Text>
      <View style={[styles.chips, styles.pad]}>
        {(users ?? []).map((u) => (
          <Pressable
            key={u.userId}
            onPress={() => toggle(u.userId)}
            style={[
              styles.pill,
              selected.includes(u.userId) && styles.pillActive,
              selected.length === 0 && inRoom.has(u.userId) && styles.pillInferred,
            ]}
          >
            <Text style={type.secondary}>
              {u.userId}
              {u.userId === displayName ? ' (you)' : ''}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.sm }]}>
      <View style={[styles.titleRow, styles.pad]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back} accessibilityLabel="Back">
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text style={type.title}>Discover</Text>
      </View>
      <FlatList
        data={busy ? [] : picks}
        keyExtractor={(p, i) => `${p.uri}-${i}`}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}
        ListEmptyComponent={
          busy ? (
            <View style={styles.empty}>
              <ActivityIndicator color={colors.text3} />
              <Text style={type.secondary}>
                {mode === 'discover' ? 'Digging for something new...' : 'Reading the room...'}
              </Text>
            </View>
          ) : (
            <Text style={[type.secondary, styles.empty]}>
              {data?.error
                ? `Couldn't build a set: ${data.error}`
                : mode === 'discover'
                  ? 'Nothing new found - the office has played everything these acts offer.'
                  : 'Not enough history yet - queue a few more tracks and come back.'}
            </Text>
          )
        }
        renderItem={({ item: p }) => (
          <SwipeRow onSwipeRight={() => void addToQueue(p.item, -1, { attribute: false })}>
            <View style={styles.row}>
              <Art uri={p.imageUrl} size={48} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={type.body} numberOfLines={1}>
                  {p.trackName}
                </Text>
                <Text style={type.secondary} numberOfLines={1}>
                  {p.artist}
                </Text>
                <Text style={type.caption} numberOfLines={1}>
                  {p.because}
                </Text>
              </View>
              <AddButton onPress={() => void addToQueue(p.item, -1, { attribute: false })} />
            </View>
          </SwipeRow>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  pad: { paddingHorizontal: space.lg },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md },
  back: { width: 44, height: 44, marginLeft: -space.md, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  pill: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.bg2,
  },
  pillActive: { backgroundColor: colors.accent },
  pillInferred: { borderWidth: 1, borderColor: colors.accent },
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.xs,
  },
  empty: { alignItems: 'center', gap: space.md, padding: space.xl, textAlign: 'center' },
});
