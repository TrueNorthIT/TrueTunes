import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Clock, Search as SearchIcon, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAddToQueue } from '../../logic/AddToQueueContext';
import { browseSub, getItemArt, getName, parseServiceSearch } from '../../logic/lib/itemHelpers';
import { api } from '../../logic/lib/sonosApi';
import { useRemoteContext } from '../../logic/RemoteContext';
import type { ServiceSearch } from '../../logic/types/ServiceSearch';
import type { SonosArtist, SonosItem } from '../../logic/types/sonos';
import {
  ArtistCircle,
  CardRow,
  MediaRow,
  routeForItem,
  shapeSearchSections,
  useDebouncedValue,
  useItemActionSheet,
} from '../../ui/media';
import { useRecentSearches } from '../../ui/media/useRecentSearches';
import { colors, radius, space, type } from '../../ui/theme';
import { isSearchable } from '../../logic/lib/searchRules';

function open(item: SonosItem) {
  const href = routeForItem(item);
  if (href) router.push(href as never);
}

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const { displayName } = useRemoteContext();
  const addToQueue = useAddToQueue();
  const { show, sheet } = useItemActionSheet(displayName);
  const [text, setText] = useState('');
  const trimmed = text.trim();
  const q = useDebouncedValue(trimmed, 350);

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['search', q],
    queryFn: async () => {
      const r = await api.search.serviceQuery(q, { count: 50 });
      return r.error ? [] : parseServiceSearch(r.data as ServiceSearch);
    },
    enabled: isSearchable(q),
    staleTime: 2 * 60 * 1000,
  });

  // Recent-search rule: a query is saved when (a) the user presses the keyboard search key, or
  // (b) the debounced query has finished loading with at least one result. Empty results are
  // never auto-saved. Each query is auto-saved once per change (lastSaved ref).
  const { recent, add: addRecent, remove: removeRecent, clear: clearRecent } = useRecentSearches();
  const lastSaved = useRef('');
  useEffect(() => {
    if (!isSearchable(q) || trimmed !== q || isFetching || results.length === 0 || lastSaved.current === q) return;
    lastSaved.current = q;
    addRecent(q);
  }, [q, trimmed, isFetching, results.length, addRecent]);

  const sections = useMemo(() => shapeSearchSections(isSearchable(q) ? results : []), [results, q]);
  const settling = trimmed !== q;
  const busy = isSearchable(trimmed) && (isFetching || settling);
  const empty = isSearchable(q) && !busy && results.length === 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.md }]}>
      <View style={styles.box}>
        <SearchIcon size={18} color={colors.text3} />
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Search songs, albums, artists"
          placeholderTextColor={colors.text3}
          style={styles.input}
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => {
            if (trimmed) {
              lastSaved.current = trimmed;
              addRecent(trimmed);
            }
          }}
          selectionColor={colors.accent}
        />
        {text ? (
          <Pressable onPress={() => setText('')} hitSlop={12} accessibilityLabel="Clear search">
            <X size={18} color={colors.text2} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: space.xxl }}>
        {busy ? <ActivityIndicator color={colors.text3} style={{ margin: space.lg }} /> : null}
        {!trimmed ? <Text style={[type.secondary, styles.msg]}>Search your music services.</Text> : null}
        {!trimmed && recent.length > 0 ? (
          <View style={{ marginTop: space.lg }}>
            <View style={styles.recentHead}>
              <Text style={[type.heading]}>Recent</Text>
              <Pressable onPress={clearRecent} hitSlop={12} accessibilityLabel="Clear recent searches">
                <Text style={[type.secondary, { color: colors.accent }]}>Clear</Text>
              </Pressable>
            </View>
            {recent.map((r) => (
              <Pressable key={r} style={styles.recentRow} onPress={() => setText(r)} accessibilityLabel={`Search ${r}`}>
                <Clock size={16} color={colors.text3} />
                <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>
                  {r}
                </Text>
                <Pressable onPress={() => removeRecent(r)} hitSlop={12} accessibilityLabel={`Remove ${r}`}>
                  <X size={16} color={colors.text2} />
                </Pressable>
              </Pressable>
            ))}
          </View>
        ) : null}
        {empty ? <Text style={[type.secondary, styles.msg]}>No results.</Text> : null}

        {sections.artists.length > 0 && (
          <Section title="Artists">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hrow}>
              {sections.artists.map((a, i) => (
                <ArtistCircle key={i} artist={a} onPress={open} onLongPress={show} />
              ))}
            </ScrollView>
          </Section>
        )}
        {sections.albums.length > 0 && (
          <Section title="Albums">
            <CardRow items={sections.albums} onOpen={open} onAdd={(i) => void addToQueue(i)} onLongPress={show} />
          </Section>
        )}
        {sections.playlists.length > 0 && (
          <Section title="Playlists">
            <CardRow items={sections.playlists} onOpen={open} onAdd={(i) => void addToQueue(i)} onLongPress={show} />
          </Section>
        )}
        {sections.tracks.length > 0 && (
          <Section title="Songs">
            {sections.tracks.map((item, i) => {
              const artists = ((item.artists ?? []) as SonosArtist[]).map((a) => a.name).join(', ');
              return (
                <MediaRow
                  key={i}
                  name={getName(item)}
                  artUrl={getItemArt(item)}
                  explicit={item.explicit}
                  subtitle={artists || undefined}
                  onAdd={() => void addToQueue(item)}
                  onSwipeAdd={() => void addToQueue(item)}
                  onPress={() => show(item)}
                  onLongPress={() => show(item)}
                />
              );
            })}
          </Section>
        )}
        {sections.others.length > 0 && (
          <Section title="Other">
            {sections.others.map((item, i) => (
              <MediaRow
                key={i}
                name={getName(item)}
                artUrl={getItemArt(item)}
                subtitle={browseSub(item) || undefined}
                onAdd={() => void addToQueue(item)}
                onPress={() => open(item)}
                onLongPress={() => show(item)}
              />
            ))}
          </Section>
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
  box: {
    marginHorizontal: space.lg,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.bg2,
  },
  input: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: space.sm },
  msg: { textAlign: 'center', marginTop: space.xl },
  sectionTitle: { paddingHorizontal: space.lg, marginBottom: space.sm },
  recentHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: space.lg, marginBottom: space.xs },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  hrow: { paddingHorizontal: space.lg, gap: space.md },
});
