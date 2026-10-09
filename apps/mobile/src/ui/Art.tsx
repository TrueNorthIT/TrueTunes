import { Image } from 'expo-image';
import { Music } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { colors, radius } from './theme';

/** Album/artist art with a placeholder. expo-image caches by URL, so no manual image cache. */
export function Art({
  uri,
  size,
  round = false,
  style,
}: {
  uri: string | null | undefined;
  size: number;
  round?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const box = { width: size, height: size, borderRadius: round ? size / 2 : radius.md };
  return (
    <View style={[styles.box, box, style]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={150}
          onError={(e) => __DEV__ && console.warn('[art] failed', uri, e.error)}
        />
      ) : (
        <Music size={size * 0.4} color={colors.text3} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.bg1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
