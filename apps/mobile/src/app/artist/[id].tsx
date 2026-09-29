import { router, useLocalSearchParams } from 'expo-router';
import { AtSign, ChevronDown, ChevronRight, Radio } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAddToQueue } from '../../logic/AddToQueueContext';
import { useArtistBrowse } from '../../logic/hooks/useArtistBrowse';
import { useDominantColor } from '../../logic/hooks/useDominantColor';
import { getItemArt, getName } from '../../logic/lib/itemHelpers';
import { useRemoteContext } from '../../logic/RemoteContext';
import type { SonosItem } from '../../logic/types/sonos';
import { Art } from '../../ui/Art';
import { BrowseTrackRow } from '../../ui/detail/BrowseTrackRow';
import { Centered, DetailTopBar, tintBackground } from '../../ui/detail/DetailChrome';
import { parseDetailParams, trackSheetItem } from '../../ui/detail/detailLogic';
import { GeniusText } from '../../ui/detail/GeniusText';
import { CardRow, routeForItem, useItemActionSheet } from '../../ui/media';
import { colors, radius, space, type } from '../../ui/theme';

function open(item: SonosItem) {
  const href = routeForItem(item);
  if (href) router.push(href as never);
}

const openUrl = (url: string) => void Linking.openURL(url).catch(() => {});

export default function ArtistScreen() {
  const p = parseDetailParams(useLocalSearchParams());
  const { displayName, playback } = useRemoteContext();
  const addToQueue = useAddToQueue();
  const { show, sheet } = useItemActionSheet(displayName);
  const { data, isLoading, isError } = useArtistBrowse(p.id, p.serviceId, p.accountId, p.defaults, p.name);
  const [showAll, setShowAll] = useState(false);

  const name = data?.name || p.name || '';
  const imageUrl = data?.imageUrl ?? null;
  const tint = useDominantColor(imageUrl);
  const genius = data?.genius ?? null;
  const altNames = genius?.alternateNames?.filter(Boolean).slice(0, 4) ?? [];
  const songs = data?.topSongs ?? [];
  const visibleSongs = showAll ? songs : songs.slice(0, 10);
  const latest = data?.albums[0] ?? null;
  const ctx = useMemo(() => ({ serviceId: p.serviceId, accountId: p.accountId, includeAlbum: true }), [p.serviceId, p.accountId]);
  const onAdd = useCallback((item: SonosItem) => void addToQueue(item), [addToQueue]);

  return (
    <View style={styles.root}>
      <DetailTopBar title={name} />
      <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }}>
        <View style={[styles.header, { backgroundColor: tintBackground(tint) }]}>
          <Art uri={imageUrl} size={140} round />
          <Text style={[type.title, styles.center]} numberOfLines={2}>
            {name}
          </Text>
          {altNames.length > 0 ? <Text style={[type.caption, styles.center]}>{altNames.join(' · ')}</Text> : null}
        </View>

        {isLoading ? <Centered loading /> : null}
        {isError && !data ? <Text style={[type.secondary, styles.msg]}>Failed to load artist.</Text> : null}

        {songs.length > 0 && (
          <Section
            title="Top Songs"
            onPress={songs.length > 10 ? () => setShowAll((s) => !s) : undefined}
            icon={songs.length > 10 ? showAll ? <ChevronDown size={18} color={colors.text2} /> : <ChevronRight size={18} color={colors.text2} /> : undefined}
          >
            {visibleSongs.map((t, i) => (
              <BrowseTrackRow
                key={`${t.id.objectId ?? i}-${i}`}
                track={t}
                ordinal={i + 1}
                fallbackArt={imageUrl}
                subtitle={((t.raw as Record<string, unknown>)?.['subtitle'] as string | undefined) || t.artists.join(', ') || undefined}
                isPlaying={!!playback.trackName && t.title === playback.trackName}
                onAdd={onAdd}
                onPress={() => show(trackSheetItem(t, ctx))}
                onLongPress={() => show(trackSheetItem(t, ctx))}
              />
            ))}
          </Section>
        )}

        {latest && (
          <Section title="Latest Release">
            <ReleaseCard item={latest} onPress={() => open(latest)} />
          </Section>
        )}

        {data && data.albums.length > 1 && (
          <Section title="Albums">
            <CardRow items={data.albums} onOpen={open} onAdd={onAdd} onLongPress={show} />
          </Section>
        )}

        {data && data.playlists.length > 0 && (
          <Section title="Radio & Shuffle">
            {data.playlists.map((pl, i) => (
              <ReleaseCard key={`${getName(pl)}-${i}`} item={pl} radio onPress={() => open(pl)} />
            ))}
          </Section>
        )}

        {genius?.description ? (
          <Section title="About">
            <View style={styles.pad}>
              <GeniusText node={genius.description} />
            </View>
          </Section>
        ) : null}

        {genius && (genius.instagram || genius.twitter) ? (
          <View style={[styles.social, styles.pad]}>
            {genius.instagram ? (
              <Pressable style={styles.socialBtn} onPress={() => openUrl(`https://instagram.com/${genius.instagram}`)} accessibilityLabel="Instagram">
                <AtSign size={16} color={colors.text} />
                <Text style={type.secondary}>Instagram</Text>
              </Pressable>
            ) : null}
            {genius.twitter ? (
              <Pressable style={styles.socialBtn} onPress={() => openUrl(`https://twitter.com/${genius.twitter}`)} accessibilityLabel="X / Twitter">
                <AtSign size={16} color={colors.text} />
                <Text style={type.secondary}>X</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
      {sheet}
    </View>
  );
}

function Section({ title, children, onPress, icon }: { title: string; children: ReactNode; onPress?: () => void; icon?: ReactNode }) {
  return (
    <View style={{ marginTop: space.lg }}>
      <Pressable onPress={onPress} disabled={!onPress} style={styles.sectionHead}>
        <Text style={type.heading}>{title}</Text>
        {icon}
      </Pressable>
      {children}
    </View>
  );
}

/** LatestReleaseCard / RadioCard: art + title + subtitle in a tappable row. */
function ReleaseCard({ item, radio, onPress }: { item: SonosItem; radio?: boolean; onPress: () => void }) {
  const sub = item['subtitle'] as string | undefined;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.release, pressed && { backgroundColor: colors.bg2 }]}>
      <View>
        <Art uri={getItemArt(item)} size={64} />
        {radio ? (
          <View style={styles.radioOverlay}>
            <Radio size={24} color={colors.text} />
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={type.body} numberOfLines={1}>
          {getName(item)}
        </Text>
        {sub ? (
          <Text style={type.secondary} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.lg },
  center: { textAlign: 'center' },
  msg: { textAlign: 'center', marginTop: space.xl },
  pad: { paddingHorizontal: space.lg },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.lg, marginBottom: space.sm, minHeight: 32 },
  release: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.xs, minHeight: 72 },
  radioOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: radius.md },
  social: { flexDirection: 'row', gap: space.sm, marginTop: space.lg },
  socialBtn: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 44, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: colors.bg2 },
});
