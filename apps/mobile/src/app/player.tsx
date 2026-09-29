import { router } from 'expo-router';
import { ChevronDown, Heart, ListMusic, Mic2, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Speaker, Volume2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
// Buttons inside a GestureDetector must be gesture-handler Pressables, or the Pan gesture can swallow their taps.
import { Gesture, GestureDetector, Pressable as GHPressable } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNowPlaying } from '../logic/hooks/useNowPlaying';
import { getActiveProvider } from '../logic/providers';
import { useRemoteContext } from '../logic/RemoteContext';
import { Art } from '../ui/Art';
import { Slider } from '../ui/Slider';
import { routeForItem } from '../ui/media/routes';
import { TintBackground } from '../ui/nowplaying/TintBackground';
import { registerColorExtractor } from '../ui/nowplaying/registerColorExtractor';
import { useFavouriteTrack } from '../ui/nowplaying/useFavouriteTrack';
import { colors, radius, space, type } from '../ui/theme';

registerColorExtractor();

const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 800;

const fmt = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Full-screen Now Playing (modal). Port of desktop PlayerBar's controls for a phone. */
export default function PlayerScreen() {
  const { playback, activeGroup } = useRemoteContext();
  const np = useNowPlaying(playback);
  const insets = useSafeAreaInsets();
  const provider = getActiveProvider();
  const [scrubMs, setScrubMs] = useState<number | null>(null);
  const { displayName } = useRemoteContext();
  const { isFavourited, toggle: toggleFavourite } = useFavouriteTrack(displayName, {
    uri: np.currentObjectId,
    trackName: np.displayTrack,
    artist: np.displayArtist,
    albumName: np.albumName ?? undefined,
    imageUrl: np.artUrlRaw,
    serviceId: np.currentServiceId,
    accountId: np.currentAccountId,
  });
  const artistHref = np.artistItem ? routeForItem(np.artistItem) : null;
  const albumHref = np.albumItem ? routeForItem(np.albumItem) : null;

  const translateY = useSharedValue(0);
  const pan = Gesture.Pan()
    .activeOffsetY([12, 10000])
    .failOffsetX([-24, 24])
    .onUpdate((e) => {
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
        scheduleOnRN(closePlayer);
      } else {
        translateY.value = withSpring(0, { damping: 20, stiffness: 220 });
      }
    });
  const slideStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  const RepeatIcon = playback.repeat === 'one' ? Repeat1 : Repeat;
  const nextRepeat = { none: 'all', all: 'one', one: 'none' } as const;

  return (
    <Animated.View style={[styles.root, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.lg }, slideStyle]}>
      <TintBackground color={np.dominantColor} />
      <GestureDetector gesture={pan}>
       <View collapsable={false} style={styles.dragZone}>
      <View style={styles.top}>
        <GHPressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Close">
          <ChevronDown size={28} color={colors.text} />
        </GHPressable>
        <GHPressable style={styles.room} onPress={() => router.push('/rooms')} accessibilityLabel="Choose room">
          <Speaker size={16} color={colors.text2} />
          <Text style={type.secondary}>{activeGroup?.name ?? 'No room'}</Text>
        </GHPressable>
        <View style={styles.topActions}>
          <GHPressable hitSlop={12} onPress={() => router.push('/lyrics')} accessibilityLabel="Lyrics">
            <Mic2 size={24} color={colors.text} />
          </GHPressable>
          <GHPressable hitSlop={12} onPress={() => router.replace('/queue')} accessibilityLabel="Open queue">
            <ListMusic size={24} color={colors.text} />
          </GHPressable>
        </View>
      </View>

      <View style={styles.artWrap}>
        <Art uri={np.artUrlRaw} size={300} style={styles.art} />
      </View>
       </View>
      </GestureDetector>

      <View style={styles.meta}>
        <View style={styles.titleRow}>
          <Text style={[type.title, styles.titleText]} numberOfLines={2}>
            {np.displayTrack || 'Nothing playing'}
          </Text>
          <Pressable
            hitSlop={12}
            onPress={() => void toggleFavourite()}
            accessibilityLabel={isFavourited ? 'Remove from Favourites' : 'Add to Favourites'}
          >
            <Heart size={24} color={isFavourited ? colors.danger : colors.text2} fill={isFavourited ? colors.danger : 'none'} />
          </Pressable>
        </View>
        {artistHref ? (
          <Pressable onPress={() => router.push(artistHref as never)} accessibilityRole="link">
            <Text style={type.secondary} numberOfLines={1}>{np.displayArtist}</Text>
          </Pressable>
        ) : (
          <Text style={type.secondary} numberOfLines={1}>{np.displayArtist}</Text>
        )}
        {np.albumName ? (
          albumHref ? (
            <Pressable onPressIn={np.prefetchAlbum} onPress={() => router.push(albumHref as never)} accessibilityRole="link">
              <Text style={type.caption} numberOfLines={1}>{np.albumName}</Text>
            </Pressable>
          ) : (
            <Text style={type.caption} numberOfLines={1}>{np.albumName}</Text>
          )
        ) : null}
      </View>

      <View style={styles.seek}>
        <Slider
          value={playback.positionMs}
          max={playback.durationMs || 1}
          onSlide={setScrubMs}
          onCommit={(ms) => {
            setScrubMs(null);
            void provider.seek(Math.round(ms));
          }}
        />
        <View style={styles.times}>
          <Text style={type.caption}>{fmt(scrubMs ?? playback.positionMs)}</Text>
          <Text style={type.caption}>{fmt(playback.durationMs)}</Text>
        </View>
      </View>

      <View style={styles.controls}>
        <Pressable hitSlop={12} onPress={() => void provider.setPlayModes({ shuffle: !playback.shuffle })} accessibilityLabel="Shuffle">
          <Shuffle size={24} color={playback.shuffle ? colors.accent : colors.text2} />
        </Pressable>
        <Pressable hitSlop={12} onPress={() => void provider.skipPrev()} accessibilityLabel="Previous">
          <SkipBack size={32} color={colors.text} fill={colors.text} />
        </Pressable>
        <Pressable
          style={styles.playBtn}
          onPress={() => void (playback.isPlaying ? provider.pause() : provider.play())}
          accessibilityLabel={playback.isPlaying ? 'Pause' : 'Play'}
        >
          {playback.isPlaying ? <Pause size={32} color={colors.bg} fill={colors.bg} /> : <Play size={32} color={colors.bg} fill={colors.bg} />}
        </Pressable>
        <Pressable hitSlop={12} onPress={() => void provider.skipNext()} accessibilityLabel="Next">
          <SkipForward size={32} color={colors.text} fill={colors.text} />
        </Pressable>
        <Pressable hitSlop={12} onPress={() => void provider.setPlayModes({ repeat: nextRepeat[playback.repeat] })} accessibilityLabel="Repeat">
          <RepeatIcon size={24} color={playback.repeat === 'none' ? colors.text2 : colors.accent} />
        </Pressable>
      </View>

      <View style={styles.volume}>
        <Volume2 size={18} color={colors.text2} />
        <View style={styles.volumeSlider}>
          <Slider value={playback.volume} max={100} onCommit={(v) => void provider.setVolume(Math.round(v))} />
        </View>
        <Text style={[type.caption, styles.volumeLabel]}>{Math.round(playback.volume)}</Text>
      </View>
    </Animated.View>
  );
}

function closePlayer() {
  router.back();
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space.xl, gap: space.lg },
  dragZone: { gap: space.lg },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  titleText: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  room: { flexDirection: 'row', alignItems: 'center', gap: space.xs, padding: space.sm, borderRadius: radius.pill, backgroundColor: colors.bg2 },
  artWrap: { alignItems: 'center', paddingVertical: space.md },
  art: { borderRadius: radius.lg },
  meta: { gap: space.xs },
  seek: { gap: 0 },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  playBtn: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  volume: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  volumeSlider: { flex: 1 },
  volumeLabel: { width: 28, textAlign: 'right' },
});
