import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import { colors } from './theme';

/**
 * Touch slider (seek / volume). Tap or drag; reports the final value on release and, optionally,
 * live values while dragging. Controlled by `value` except while the finger is down.
 */
export function Slider({
  value,
  max,
  onCommit,
  onSlide,
  height = 4,
  color = colors.text,
}: {
  value: number;
  max: number;
  onCommit: (value: number) => void;
  onSlide?: (value: number) => void;
  height?: number;
  color?: string;
}) {
  const [width, setWidth] = useState(0);
  const [dragFraction, setDragFraction] = useState<number | null>(null);
  const startFraction = useRef(0);
  // PanResponder is created once; keep the latest props/width reachable from it.
  const latest = useRef({ width, max, onCommit, onSlide });
  latest.current = { width, max, onCommit, onSlide };

  const clamp = (f: number) => Math.min(1, Math.max(0, f));

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const { width: w, max: m, onSlide: slide } = latest.current;
        if (!w) return;
        startFraction.current = clamp(e.nativeEvent.locationX / w);
        setDragFraction(startFraction.current);
        slide?.(startFraction.current * m);
      },
      onPanResponderMove: (_e, g) => {
        const { width: w, max: m, onSlide: slide } = latest.current;
        if (!w) return;
        const f = clamp(startFraction.current + g.dx / w);
        setDragFraction(f);
        slide?.(f * m);
      },
      onPanResponderRelease: (_e, g) => {
        const { width: w, max: m, onCommit: commit } = latest.current;
        if (w) commit(clamp(startFraction.current + g.dx / w) * m);
        setDragFraction(null);
      },
      onPanResponderTerminate: () => setDragFraction(null),
    }),
  ).current;

  const fraction = dragFraction ?? (max > 0 ? clamp(value / max) : 0);

  return (
    <View style={styles.hit} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} {...pan.panHandlers}>
      <View style={[styles.track, { height, borderRadius: height / 2 }]}>
        <View style={[styles.fill, { width: `${fraction * 100}%`, backgroundColor: color, borderRadius: height / 2 }]} />
      </View>
      <View
        pointerEvents="none"
        style={[styles.thumb, { left: `${fraction * 100}%`, backgroundColor: color, opacity: dragFraction === null ? 0 : 1 }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { height: 32, justifyContent: 'center' },
  track: { backgroundColor: colors.border2, overflow: 'hidden' },
  fill: { height: '100%' },
  thumb: { position: 'absolute', width: 14, height: 14, borderRadius: 7, marginLeft: -7 },
});
