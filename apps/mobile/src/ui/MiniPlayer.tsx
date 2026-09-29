import { router } from 'expo-router';
import { Pause, Play } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNowPlaying } from '../logic/hooks/useNowPlaying';
import { getActiveProvider } from '../logic/providers';
import { useRemoteContext } from '../logic/RemoteContext';
import { Art } from './Art';
import { haptic } from './haptics';
import { colors, radius, space, type } from './theme';

/** Persistent bar above the tabs; tap to open the full Now Playing screen. */
export function MiniPlayer() {
  const { playback, activeGroup } = useRemoteContext();
  // Track details (art, clean title/artist) layered over the raw playback state, as on desktop.
  const np = useNowPlaying(playback);
  // Nothing loaded (idle group): no bar. Rooms stay reachable from the More tab.
  if (!playback.isVisible || !np.displayTrack) return null;
  const provider = getActiveProvider();

  return (
    <Pressable style={styles.bar} onPress={() => router.push('/player')} accessibilityLabel="Open now playing">
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${playback.progressPct}%` }]} />
      </View>
      <Art uri={np.artUrlRaw} size={44} />
      <View style={styles.text}>
        <Text style={type.body} numberOfLines={1}>
          {np.displayTrack}
        </Text>
        <Text style={type.secondary} numberOfLines={1}>
          {np.displayArtist}
          {activeGroup ? ` · ${activeGroup.name}` : ''}
        </Text>
      </View>
      <Pressable
        hitSlop={12}
        style={styles.play}
        onPress={() => {
          haptic.light();
          void (playback.isPlaying ? provider.pause() : provider.play());
        }}
        accessibilityLabel={playback.isPlaying ? 'Pause' : 'Play'}
      >
        {playback.isPlaying ? <Pause size={22} color={colors.text} fill={colors.text} /> : <Play size={22} color={colors.text} fill={colors.text} />}
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginHorizontal: space.sm,
    marginBottom: space.sm,
    padding: space.sm,
    paddingTop: space.md,
    backgroundColor: colors.bg1,
    borderRadius: radius.lg,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  progressTrack: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, backgroundColor: colors.border },
  progressFill: { height: 2, backgroundColor: colors.text },
  text: { flex: 1 },
  play: { padding: space.sm },
});
