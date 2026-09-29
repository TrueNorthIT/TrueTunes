import { GripVertical, Check } from 'lucide-react-native';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Art } from '../Art';
import { SwipeRow } from '../SwipeRow';
import { colors, radius, space, type } from '../theme';
import { useQueueTrack } from '../../logic/hooks/useQueueTrack';
import { ROW_HEIGHT } from './queueLogic';
import type { NormalizedQueueItem } from '../../logic/types/provider';

interface Props {
  item: NormalizedQueueItem;
  index: number;
  isPlaying: boolean;
  isSelected: boolean;
  selectMode: boolean;
  isDragging: boolean;
  swipeEnabled: boolean;
  addedBy?: string;
  onPress: (index: number) => void;
  onLongPress: (index: number) => void;
  onRemove: (index: number) => void;
  onDragHandle: () => void;
}

function QueueRowImpl({
  item,
  index,
  isPlaying,
  isSelected,
  selectMode,
  isDragging,
  swipeEnabled,
  addedBy,
  onPress,
  onLongPress,
  onRemove,
  onDragHandle,
}: Props) {
  const t = item.track;
  // Queue resources carry only ids; art and artist come from track details, as on desktop.
  const { artUrl, artist } = useQueueTrack(item, null);
  const bg = [isPlaying && styles.playing, isSelected && styles.selected, isDragging && styles.dragging];
  // Swipe covers the row body only; the grip sits outside it so drag and swipe never compete.
  return (
    <View style={styles.outer}>
      <SwipeRow style={styles.flex} disabled={!swipeEnabled} onSwipeLeft={() => onRemove(index)}>
        <Pressable
          onPress={() => onPress(index)}
          onLongPress={() => onLongPress(index)}
          delayLongPress={350}
          android_ripple={{ color: colors.bg2 }}
          style={[styles.row, ...bg]}
        >
          {selectMode && (
            <View style={[styles.check, isSelected && styles.checkOn]}>
              {isSelected && <Check size={14} color={colors.text} strokeWidth={3} />}
            </View>
          )}
          <Art uri={artUrl} size={44} />
          <View style={styles.text}>
            <View style={styles.titleRow}>
              <Text style={[type.body, isPlaying && styles.playingText, styles.title]} numberOfLines={1}>
                {t.title}
              </Text>
              {t.isExplicit && (
                <View style={styles.explicit}>
                  <Text style={styles.explicitText}>E</Text>
                </View>
              )}
            </View>
            {!!artist && (
              <Text style={type.secondary} numberOfLines={1}>
                {artist}
              </Text>
            )}
            {!!addedBy && (
              <Text style={type.caption} numberOfLines={1}>
                added by {addedBy}
              </Text>
            )}
          </View>
        </Pressable>
      </SwipeRow>
      {!selectMode && (
        <Pressable
          onPressIn={onDragHandle}
          hitSlop={8}
          style={[styles.handle, ...bg]}
          accessibilityLabel="Drag to reorder"
        >
          <GripVertical size={20} color={colors.text3} />
        </Pressable>
      )}
    </View>
  );
}

export const QueueRow = memo(QueueRowImpl);

const styles = StyleSheet.create({
  outer: { flexDirection: 'row', alignItems: 'stretch', backgroundColor: colors.bg, height: ROW_HEIGHT },
  flex: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingLeft: space.lg,
    paddingVertical: space.sm,
  },
  playing: { backgroundColor: 'rgba(42,109,244,0.16)' },
  selected: { backgroundColor: 'rgba(42,109,244,0.28)' },
  dragging: { backgroundColor: colors.bg1, elevation: 8 },
  text: { flex: 1, gap: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  title: { flexShrink: 1 },
  playingText: { color: colors.accent, fontWeight: '600' },
  explicit: { backgroundColor: colors.text3, borderRadius: 3, paddingHorizontal: 4 },
  explicitText: { color: colors.bg, fontSize: 10, fontWeight: '700' },
  handle: { paddingHorizontal: space.lg, alignItems: 'center', justifyContent: 'center' },
  check: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.border2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
});
