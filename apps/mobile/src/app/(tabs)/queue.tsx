import { ArrowDown, ArrowUp, ListMusic, Trash2 } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { FlatList } from 'react-native';
import DraggableFlatList from 'react-native-draggable-flatlist';
import type { RenderItemParams } from 'react-native-draggable-flatlist';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAttribution } from '../../logic/hooks/useAttribution';
import { getActiveProvider } from '../../logic/providers';
import { useRemoteContext } from '../../logic/RemoteContext';
import type { NormalizedQueueItem } from '../../logic/types/provider';
import { QueueRow } from '../../ui/queue/QueueRow';
import {
  ROW_HEIGHT, buildKeys, findPlayingIndex, isPlayingRow, planSingleReorder, playingPosition, scrollOffsetForPlaying, shouldAutoFollow, removeIndices, resolveAttribution, toggleSelection, trackNumberForIndex,
} from '../../ui/queue/queueLogic';
import { DjSection } from '../../ui/queue/DjSection';
import { SelectionBar } from '../../ui/queue/SelectionBar';
import { colors, space, type } from '../../ui/theme';
import { useShowToast } from '../../ui/Toast';
import { haptic } from '../../ui/haptics';

export default function QueueScreen() {
  const insets = useSafeAreaInsets();
  const showToast = useShowToast();
  const { queue, playback, groups, activeGroup } = useRemoteContext();
  const { items, setItems, isLoading, error, reload } = queue;
  const attribution = useAttribution(reload);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dragging, setDragging] = useState(false);

  // ── Keep the list on the playing track ──────────────────────────────────────────────
  // Land on it when the queue first shows, follow it as tracks change while the user hasn't scrolled
  // away, and offer a pill to jump back when it is off-screen.
  const listRef = useRef<FlatList<NormalizedQueueItem>>(null);
  const scrollY = useRef(0);
  const following = useRef(true);
  const landedFor = useRef<string | null>(null);
  const lastPlayingIndex = useRef(-1);
  const [viewHeight, setViewHeight] = useState(0);
  const [position, setPosition] = useState<'none' | 'visible' | 'above' | 'below'>('none');
  const playingIndex = useMemo(
    () => findPlayingIndex(items, playback.queueItemId, playback.currentObjectId),
    [items, playback.queueItemId, playback.currentObjectId],
  );

  const refreshPosition = useCallback(() => {
    const next = playingPosition(playingIndex, scrollY.current, viewHeight);
    setPosition((prev) => (prev === next ? prev : next));
  }, [playingIndex, viewHeight]);
  useEffect(refreshPosition, [refreshPosition]);

  const scrollToPlaying = useCallback(
    (animated: boolean) => {
      if (playingIndex < 0) return;
      listRef.current?.scrollToOffset({ offset: scrollOffsetForPlaying(playingIndex), animated });
    },
    [playingIndex],
  );

  useEffect(() => {
    if (playingIndex < 0 || viewHeight <= 0) return;
    const groupKey = activeGroup?.id ?? '';
    if (landedFor.current !== groupKey) {
      // First time this group's queue is shown: jump straight there, no animation.
      landedFor.current = groupKey;
      lastPlayingIndex.current = playingIndex;
      following.current = true;
      const t = setTimeout(() => scrollToPlaying(false), 60);
      return () => clearTimeout(t);
    }
    if (shouldAutoFollow(following.current, lastPlayingIndex.current, playingIndex)) scrollToPlaying(true);
    lastPlayingIndex.current = playingIndex;
  }, [playingIndex, viewHeight, activeGroup?.id, scrollToPlaying]);

  const jumpToPlaying = useCallback(() => {
    following.current = true;
    scrollToPlaying(true);
  }, [scrollToPlaying]);

  // Desktop clears the selection whenever the list changes.
  useEffect(() => { setSelected(new Set()); }, [items]);

  const exitSelect = useCallback(() => { setSelectMode(false); setSelected(new Set()); }, []);
  useEffect(() => {
    if (!selectMode) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { exitSelect(); return true; });
    return () => sub.remove();
  }, [selectMode, exitSelect]);
  useEffect(() => { if (items.length === 0) exitSelect(); }, [items.length, exitSelect]);

  const keys = useMemo(() => buildKeys(items), [items]);
  const keyOf = useCallback(
    (item: NormalizedQueueItem, i?: number) => keys[items.indexOf(item)] ?? String(i),
    [keys, items],
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    reload();
    setTimeout(() => setRefreshing(false), 1000);
  }, [reload]);

  const onPress = useCallback((index: number) => {
    if (selectMode) {
      const next = toggleSelection(selected, index);
      setSelected(next.selected);
      if (!next.selectMode) setSelectMode(false);
      return;
    }
    getActiveProvider().skipToTrack(trackNumberForIndex(index)).catch(() => showToast('Failed to skip to track', 'error'));
  }, [selectMode, selected, showToast]);

  const onLongPress = useCallback((index: number) => {
    haptic.medium();
    setSelectMode(true);
    setSelected((s) => (s.has(index) ? s : new Set(s).add(index)));
  }, []);

  const removeSelected = useCallback(async () => {
    const indices = [...selected];
    if (indices.length === 0) return;
    const sel = new Set(selected);
    setItems((prev) => removeIndices(prev, sel));
    setSelected(new Set());
    try {
      await window.sonos.removeFromQueue(indices);
    } catch {
      showToast('Failed to remove tracks', 'error');
      reload();
    }
  }, [selected, setItems, reload, showToast]);

  const removeOne = useCallback(async (index: number) => {
    setItems((prev) => removeIndices(prev, new Set([index])));
    try {
      await window.sonos.removeFromQueue([index]);
    } catch {
      showToast('Failed to remove track', 'error');
      reload();
    }
  }, [setItems, reload, showToast]);

  const clearQueue = useCallback(() => {
    Alert.alert('Clear queue', `Clear all ${items.length} tracks?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          setItems([]);
          exitSelect();
          try {
            await window.sonos.clearQueue();
          } catch {
            showToast('Failed to clear queue', 'error');
            reload();
          }
        },
      },
    ]);
  }, [items.length, setItems, exitSelect, reload, showToast]);

  const onDragEnd = useCallback(async ({ from, to }: { from: number; to: number }) => {
    setDragging(false);
    if (from === to) return;
    const plan = planSingleReorder(items, from, to);
    setItems(plan.next);
    try {
      await window.sonos.reorderQueue(plan.fromIndices, plan.toIndex, plan.queueLength);
    } catch {
      showToast('Failed to reorder queue', 'error');
      reload();
    }
  }, [items, setItems, reload, showToast]);

  const currentObjectId = playback.currentObjectId;

  const renderItem = useCallback(
    ({ item, getIndex, drag, isActive }: RenderItemParams<NormalizedQueueItem>) => {
      const index = getIndex() ?? 0;
      return (
        <QueueRow
          item={item}
          index={index}
          isPlaying={isPlayingRow(index, item.track.id, playback.queueItemId, currentObjectId)}
          isSelected={selected.has(index)}
          selectMode={selectMode}
          isDragging={isActive}
          swipeEnabled={!selectMode && !dragging}
          addedBy={resolveAttribution(attribution, item.track)?.user}
          onPress={onPress}
          onLongPress={onLongPress}
          onRemove={removeOne}
          onDragHandle={() => {
            haptic.medium();
            drag();
          }}
        />
      );
    },
    [playback.queueItemId, currentObjectId, selected, selectMode, dragging, attribution, onPress, onLongPress, removeOne],
  );

  const title = `Queue${activeGroup ? ` · ${activeGroup.name}` : ''}${items.length ? ` · ${items.length}` : ''}`;
  const showSpinner = isLoading && items.length === 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={[type.title, styles.headerText]} numberOfLines={1}>{title}</Text>
        {items.length > 0 && !selectMode && (
          <Pressable hitSlop={8} onPress={clearQueue} accessibilityLabel="Clear queue">
            <Trash2 size={20} color={colors.text2} />
          </Pressable>
        )}
      </View>
      {showSpinner ? (
        <View style={styles.center}><ActivityIndicator color={colors.text2} /></View>
      ) : error && items.length === 0 ? (
        <View style={styles.center}>
          <Text style={type.secondary}>{error}</Text>
          <Pressable onPress={onRefresh}><Text style={[type.body, { color: colors.accent }]}>Retry</Text></Pressable>
        </View>
      ) : (
        <View style={styles.listWrap} onLayout={(e) => setViewHeight(e.nativeEvent.layout.height)}>
        <DraggableFlatList
          ref={listRef}
          onScrollOffsetChange={(y) => {
            scrollY.current = y;
            refreshPosition();
          }}
          onScrollBeginDrag={() => {
            following.current = false;
          }}
          getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
          data={items}
          keyExtractor={keyOf}
          renderItem={renderItem}
          onDragBegin={() => setDragging(true)}
          onRelease={() => setDragging(false)}
          onDragEnd={onDragEnd}
          activationDistance={12}
          // Rows load their own track details when they mount, so a small render window means far-away
          // rows are only fetched as you scroll toward them.
          initialNumToRender={12}
          maxToRenderPerBatch={8}
          windowSize={7}
          ListFooterComponent={items.length > 0 ? <DjSection /> : null}
          extraData={[selected, selectMode, dragging, playback.queueItemId, attribution]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text2} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <ListMusic size={40} color={colors.text3} />
              <Text style={type.secondary}>{groups.length === 0 ? 'No speakers found.' : 'Queue is empty.'}</Text>
            </View>
          }
          contentContainerStyle={items.length === 0 ? styles.emptyContent : undefined}
        />
        {!selectMode && (position === 'above' || position === 'below') && (
          <Pressable style={styles.jump} onPress={jumpToPlaying} accessibilityLabel="Scroll to now playing">
            {position === 'above' ? <ArrowUp size={16} color={colors.text} /> : <ArrowDown size={16} color={colors.text} />}
            <Text style={type.secondary}>Now playing</Text>
          </Pressable>
        )}
        </View>
      )}
      {selectMode && (
        <SelectionBar count={selected.size} onRemove={removeSelected} onClear={clearQueue} onCancel={exitSelect} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  listWrap: { flex: 1 },
  jump: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: 999,
    backgroundColor: colors.bg1,
    borderColor: colors.border2,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 6,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  headerText: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xxl },
  emptyContent: { flexGrow: 1 },
});
