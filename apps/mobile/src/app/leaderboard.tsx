import { router } from 'expo-router';
import type { Href } from 'expo-router';
import { Info, Plus, RefreshCw, X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useGameRankings } from '../logic/hooks/useDailyGame';
import { useStats } from '../logic/hooks/useStats';
import type { StatsPeriod } from '../logic/hooks/useStats';
import { useAddToQueue } from '../logic/AddToQueueContext';
import { barPercent, plural, QUEUEDLE_TIER_INFO, statsFooter, tierEmoji } from '../logic/lib/socialFormat';
import type { SonosItem } from '../logic/types/sonos';
import { Art } from '../ui/Art';
import { SwipeRow } from '../ui/SwipeRow';
import { ScreenHeader, SectionTitle, Segmented } from '../ui/social/common';
import { colors, radius, space, type } from '../ui/theme';

type View_ = StatsPeriod | 'queuedle';

const OPTIONS: { value: View_; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'alltime', label: 'All time' },
  { value: 'queuedle', label: 'Queuedle' },
];

const MEDALS = ['#d4af37', '#b0b7c0', '#b0703c'];

function Rank({ index }: { index: number }) {
  if (index < 3) {
    return (
      <View style={[styles.medal, { backgroundColor: MEDALS[index] }]}>
        <Text style={styles.medalText}>{index + 1}</Text>
      </View>
    );
  }
  return <Text style={[type.secondary, styles.rankNum]}>{index + 1}</Text>;
}

function Bar({ pct }: { pct: number }) {
  return (
    <View style={styles.barWrap}>
      <View style={[styles.bar, { width: `${pct}%` }]} />
    </View>
  );
}

const openProfile = (name: string) => router.push(`/profile/${encodeURIComponent(name)}` as Href);

function trackItem(t: StatsTrack): SonosItem {
  return {
    type: 'TRACK',
    name: t.trackName,
    artist: t.artist,
    imageUrl: t.imageUrl,
    id: { objectId: t.uri ?? '', serviceId: t.serviceId ?? '', accountId: t.accountId ?? '' },
  } as SonosItem;
}

/** Port of desktop LeaderboardPanel. Tap a top-queuer row to filter stats to that user, their name to open the profile. */
export default function LeaderboardScreen() {
  const [view, setView] = useState<View_>('week');
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const isQueuedle = view === 'queuedle';
  const period: StatsPeriod = isQueuedle ? 'week' : view;
  const stats = useStats(period, selectedUser ?? undefined);
  const rankings = useGameRankings(null, isQueuedle);
  const addToQueue = useAddToQueue();
  const data = stats.data;

  const rows = rankings.data ?? [];
  const maxAvg = rows[0]?.averageTotal ?? 1;
  const maxUser = data?.topUsers?.[0]?.count ?? 1;

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={selectedUser ?? 'Leaderboard'}
        onBack={selectedUser ? () => setSelectedUser(null) : undefined}
        right={
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <Pressable
              hitSlop={8}
              onPress={() => (isQueuedle ? void rankings.refetch() : void stats.refetch())}
              accessibilityLabel="Refresh"
            >
              <RefreshCw size={20} color={colors.text2} />
            </Pressable>
            <Pressable hitSlop={8} onPress={() => setInfoOpen(true)} accessibilityLabel="Rank info">
              <Info size={20} color={colors.text2} />
            </Pressable>
          </View>
        }
      />
      <View style={{ paddingHorizontal: space.lg }}>
        <Segmented
          options={OPTIONS}
          value={view}
          onChange={(v) => {
            if (v === 'queuedle') setSelectedUser(null);
            setView(v);
          }}
        />
      </View>

      <ScrollView contentContainerStyle={styles.pad}>
        {isQueuedle ? (
          <>
            <SectionTitle>Queuedle all-time average</SectionTitle>
            {rankings.isLoading && <ActivityIndicator color={colors.text2} />}
            {rankings.error && <Text style={type.secondary}>Failed to load Queuedle rankings</Text>}
            {!rankings.isLoading && !rankings.error && rows.length === 0 && (
              <Text style={type.secondary}>No Queuedle scores yet</Text>
            )}
            {rows.slice(0, 25).map((r, i) => (
              <Pressable key={r.userName} style={styles.row} onPress={() => openProfile(r.userName)}>
                <Rank index={i} />
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={styles.between}>
                    <Text style={type.body} numberOfLines={1}>
                      {r.userName}
                    </Text>
                    <Text style={type.body}>{r.averageTotal.toFixed(1)}</Text>
                  </View>
                  <Bar pct={barPercent(r.averageTotal, maxAvg)} />
                  <Text style={type.caption}>
                    {plural(r.gamesPlayed, 'game')} ·{' '}
                    {r.isProvisional ? 'Provisional' : `${tierEmoji(r.tierKey)} ${r.tierName}`} ·{' '}
                    {r.averagePercent.toFixed(0)}% avg
                  </Text>
                </View>
              </Pressable>
            ))}
          </>
        ) : (
          <>
            {stats.isLoading && <ActivityIndicator color={colors.text2} style={{ marginTop: space.xl }} />}
            {(stats.error || data?.error) && (
              <Text style={type.secondary}>{data?.error ?? 'Failed to load stats'}</Text>
            )}
            {data && !data.error && (
              <>
                {!selectedUser && (
                  <>
                    <SectionTitle>Top queuers</SectionTitle>
                    {data.topUsers.length === 0 && <Text style={type.secondary}>No data yet for this period</Text>}
                    {data.topUsers.map((u, i) => (
                      <Pressable
                        key={u.userId}
                        style={styles.row}
                        onPress={() => setSelectedUser(u.userId)}
                        onLongPress={() => openProfile(u.userId)}
                      >
                        <Rank index={i} />
                        <View style={{ flex: 1, gap: 4 }}>
                          <View style={styles.between}>
                            <Text style={type.body} numberOfLines={1}>
                              {u.userId}
                            </Text>
                            <Text style={type.body}>{u.count}</Text>
                          </View>
                          <Bar pct={barPercent(u.count, maxUser)} />
                        </View>
                      </Pressable>
                    ))}
                    <Text style={[type.caption, { marginTop: space.xs }]}>
                      Tap to filter by user, long-press to open their profile.
                    </Text>
                  </>
                )}

                <SectionTitle>Top tracks</SectionTitle>
                {data.topTracks.length === 0 && <Text style={type.secondary}>No data yet</Text>}
                {data.topTracks.map((t, i) => (
                  <SwipeRow key={i} onSwipeRight={t.uri ? () => void addToQueue(trackItem(t)) : undefined}>
                    <View style={styles.row}>
                      <Art uri={t.imageUrl} size={44} />
                      <View style={{ flex: 1 }}>
                        <Text style={type.body} numberOfLines={1}>
                          {t.trackName}
                        </Text>
                        <Text style={type.caption} numberOfLines={1}>
                          {[t.artist, t.album].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                      <Text style={type.secondary}>{t.count}x</Text>
                      {!!t.uri && (
                        <Pressable
                          hitSlop={10}
                          onPress={() => void addToQueue(trackItem(t))}
                          accessibilityLabel={`Add ${t.trackName} to queue`}
                        >
                          <Plus size={20} color={colors.accent} />
                        </Pressable>
                      )}
                    </View>
                  </SwipeRow>
                ))}

                <SectionTitle>Top artists</SectionTitle>
                {data.topArtists.length === 0 && <Text style={type.secondary}>No data yet</Text>}
                {data.topArtists.map((a, i) => (
                  <View key={i} style={styles.row}>
                    <Text style={[type.secondary, styles.rankNum]}>{i + 1}</Text>
                    <Art uri={a.imageUrl} size={44} round />
                    <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>
                      {a.artist}
                    </Text>
                    <Text style={type.secondary}>{a.count}x</Text>
                  </View>
                ))}

                <SectionTitle>Top albums</SectionTitle>
                {data.topAlbums.length === 0 && <Text style={type.secondary}>No data yet</Text>}
                {data.topAlbums.map((a, i) => (
                  <View key={i} style={styles.row}>
                    <Art uri={a.imageUrl} size={44} />
                    <View style={{ flex: 1 }}>
                      <Text style={type.body} numberOfLines={1}>
                        {a.album}
                      </Text>
                      <Text style={type.caption} numberOfLines={1}>
                        {a.artist}
                      </Text>
                    </View>
                    <Text style={type.secondary}>{a.count}x</Text>
                  </View>
                ))}

                <Text style={[type.caption, { textAlign: 'center', marginTop: space.xl }]}>
                  {statsFooter(data.totalEvents, data.periodStart, selectedUser)}
                </Text>
              </>
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={infoOpen} transparent animationType="fade" onRequestClose={() => setInfoOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setInfoOpen(false)}>
          <Pressable style={styles.dialog} onPress={() => {}}>
            <View style={styles.between}>
              <Text style={type.heading}>Queuedle Rank Tiers</Text>
              <Pressable hitSlop={10} onPress={() => setInfoOpen(false)} accessibilityLabel="Close">
                <X size={20} color={colors.text2} />
              </Pressable>
            </View>
            <Text style={type.secondary}>
              Rank tiers use your all-time Queuedle percentage: total points earned divided by total possible points
              across games played. You need 3 played days before a tier unlocks.
            </Text>
            {QUEUEDLE_TIER_INFO.map((t) => (
              <View key={t.key} style={styles.between}>
                <Text style={type.body}>
                  {t.emoji} {t.name}
                </Text>
                <Text style={type.secondary}>{t.range}</Text>
              </View>
            ))}
            <Text style={type.caption}>Fewer than 3 played days = Provisional (no tier)</Text>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  pad: { paddingHorizontal: space.lg, paddingBottom: space.xxl * 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  rankNum: { width: 24, textAlign: 'center' },
  medal: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  medalText: { color: '#000', fontWeight: '700', fontSize: 12 },
  barWrap: { height: 4, borderRadius: 2, backgroundColor: colors.bg2, overflow: 'hidden' },
  bar: { height: 4, backgroundColor: colors.accent },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: space.lg },
  dialog: { backgroundColor: colors.bg1, borderRadius: radius.lg, padding: space.lg, gap: space.md },
});
