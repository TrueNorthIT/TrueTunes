import { ListPlus, Trash2 } from 'lucide-react-native';
import { memo, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { interpolate, useAnimatedStyle } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { colors, space } from './theme';
import { haptic } from './haptics';

const ACTION_WIDTH = 96;
/** Release past this distance commits the action; shorter swipes just spring back. */
const COMMIT_DISTANCE = 64;
/** Horizontal travel before the pan activates, so vertical list scrolling is not hijacked. */
const ACTIVATE_OFFSET = 20;
const NEVER = 10000;

interface Props {
  children: ReactNode;
  /** Swipe right: reveals the left-side "Add to queue" action. */
  onSwipeRight?: () => void;
  /** Swipe left: reveals the right-side "Remove" action. */
  onSwipeLeft?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

function Action({
  progress,
  side,
  label,
  bg,
  children,
}: {
  progress: SharedValue<number>;
  side: 'left' | 'right';
  label: string;
  bg: string;
  children: ReactNode;
}) {
  const anim = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.4, 1], [0, 0.6, 1], 'clamp'),
    transform: [{ scale: interpolate(progress.value, [0, 1], [0.6, 1], 'clamp') }],
  }));
  return (
    <View style={[styles.action, { backgroundColor: bg, alignItems: side === 'left' ? 'flex-start' : 'flex-end' }]}>
      <Animated.View style={[styles.actionInner, anim]}>
        {children}
        <Text style={styles.actionLabel}>{label}</Text>
      </Animated.View>
    </View>
  );
}

function SwipeRowImpl({ children, onSwipeRight, onSwipeLeft, disabled, style }: Props) {
  const ref = useRef<SwipeableMethods>(null);

  const onOpen = useCallback(
    (direction: 'left' | 'right') => {
      // 'right' = row dragged right (left actions revealed).
      haptic.medium();
      if (direction === 'right') onSwipeRight?.();
      else onSwipeLeft?.();
      ref.current?.close();
    },
    [onSwipeRight, onSwipeLeft]
  );

  if (disabled || (!onSwipeRight && !onSwipeLeft)) return <View style={[styles.content, style]}>{children}</View>;

  return (
    <ReanimatedSwipeable
      ref={ref}
      containerStyle={style}
      friction={1}
      overshootLeft={false}
      overshootRight={false}
      leftThreshold={COMMIT_DISTANCE}
      rightThreshold={COMMIT_DISTANCE}
      dragOffsetFromLeftEdge={onSwipeRight ? ACTIVATE_OFFSET : NEVER}
      dragOffsetFromRightEdge={onSwipeLeft ? ACTIVATE_OFFSET : NEVER}
      onSwipeableOpen={onOpen}
      renderLeftActions={
        onSwipeRight
          ? (p) => (
              <Action progress={p} side="left" label="Add to queue" bg={colors.accent}>
                <ListPlus size={22} color={colors.text} />
              </Action>
            )
          : undefined
      }
      renderRightActions={
        onSwipeLeft
          ? (p) => (
              <Action progress={p} side="right" label="Remove" bg={colors.danger}>
                <Trash2 size={22} color={colors.text} />
              </Action>
            )
          : undefined
      }
    >
      <View style={styles.content}>{children}</View>
    </ReanimatedSwipeable>
  );
}

export const SwipeRow = memo(SwipeRowImpl);

const styles = StyleSheet.create({
  // Opaque so the action panels behind the row are hidden until it is dragged.
  content: { backgroundColor: colors.bg },
  action: { width: ACTION_WIDTH, justifyContent: 'center', paddingHorizontal: space.lg },
  actionInner: { alignItems: 'center', gap: 2 },
  actionLabel: { color: colors.text, fontSize: 11, fontWeight: '600' },
});
