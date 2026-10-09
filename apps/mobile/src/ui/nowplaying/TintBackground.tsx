import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors } from '../theme';
import { rgba } from './colorMath';

/** Soft vertical gradient from the artwork colour into the bg; cross-fades when the colour changes. */
export function TintBackground({ color }: { color: string | null }) {
  const [layers, setLayers] = useState<{ prev: string | null; cur: string | null }>({ prev: null, cur: color });
  const shown = useRef(color);
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (shown.current === color) return;
    setLayers({ prev: shown.current, cur: color });
    shown.current = color;
    opacity.value = 0;
    opacity.value = withTiming(1, { duration: 600 });
  }, [color, opacity]);

  const curStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const prevStyle = useAnimatedStyle(() => ({ opacity: 1 - opacity.value }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {layers.prev ? (
        <Animated.View style={[StyleSheet.absoluteFill, prevStyle]}>
          <Gradient color={layers.prev} />
        </Animated.View>
      ) : null}
      {layers.cur ? (
        <Animated.View style={[StyleSheet.absoluteFill, curStyle]}>
          <Gradient color={layers.cur} />
        </Animated.View>
      ) : null}
    </View>
  );
}

function Gradient({ color }: { color: string }) {
  return (
    <LinearGradient colors={[rgba(color, 0.55), colors.bg]} locations={[0, 0.6]} style={StyleSheet.absoluteFill} />
  );
}
