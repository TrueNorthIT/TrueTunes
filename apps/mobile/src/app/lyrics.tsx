import { Stack } from 'expo-router';
import { MicVocal } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useGeniusDescription } from '../logic/hooks/useGeniusDescription';
import { useLyrics } from '../logic/hooks/useLyrics';
import { activeLyricIndex, lyricOpacity } from '../logic/lib/socialFormat';
import { useRemoteContext } from '../logic/RemoteContext';
import { Art } from '../ui/Art';
import { ScreenHeader } from '../ui/social/common';
import { colors, space, type } from '../ui/theme';

/** Flatten desktop's Genius DOM description tree to plain text paragraphs. */
function domText(node: GeniusDomNode | string | null | undefined): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  const inner = (node.children ?? []).map((c) => domText(c as GeniusDomNode | string)).join('');
  if (node.tag === 'p') return `${inner}\n\n`;
  if (node.tag === 'br') return '\n';
  return inner;
}

/** Synced lyrics (LRCLIB) with active-line highlight and auto-scroll. Port of desktop LyricsPanel. */
export default function LyricsScreen() {
  const { playback } = useRemoteContext();
  const track = playback.trackName;
  const artist = playback.artistName;
  const { lines, isLoading, isInstrumental, notFound } = useLyrics(track, artist, playback.currentAlbumName, playback.durationMs);
  const { description } = useGeniusDescription(track, artist);

  // +250ms lead like desktop so the highlight lands as the line starts.
  const active = activeLyricIndex(lines, playback.positionMs + 250);

  const scroll = useRef<ScrollView>(null);
  const ys = useRef<number[]>([]);
  const viewH = useRef(0);
  const first = useRef(true);
  const [ready, setReady] = useState(0);

  useEffect(() => {
    if (active < 0) return;
    const y = ys.current[active];
    if (y == null) return;
    scroll.current?.scrollTo({ y: Math.max(0, y - viewH.current / 3), animated: !first.current });
    first.current = false;
  }, [active, ready]);

  // New track: reset scroll bookkeeping.
  useEffect(() => {
    ys.current = [];
    first.current = true;
  }, [track, artist]);

  const desc = description ? domText(description).trim() : '';

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ animation: 'slide_from_bottom' }} />
      <ScreenHeader title="Lyrics" />
      <View style={styles.meta}>
        <Art uri={playback.artUrl} size={56} />
        <View style={{ flex: 1 }}>
          <Text style={type.heading} numberOfLines={1}>{track || 'Nothing playing'}</Text>
          <Text style={type.secondary} numberOfLines={1}>{artist}</Text>
        </View>
      </View>
      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={styles.pad}
        onLayout={(e: LayoutChangeEvent) => { viewH.current = e.nativeEvent.layout.height; }}
      >
        {isLoading && (
          <View style={styles.center}>
            <MicVocal size={36} color={colors.text3} />
            <ActivityIndicator color={colors.text2} style={{ marginTop: space.md }} />
          </View>
        )}
        {!isLoading && isInstrumental && <Text style={styles.status}>♪ Instrumental ♪</Text>}
        {!isLoading && !track && <Text style={styles.status}>Play something to see lyrics</Text>}
        {!isLoading && !!track && notFound && !isInstrumental && <Text style={styles.status}>No lyrics found</Text>}
        {lines.map((line, i) => (
          <Text
            key={i}
            onLayout={(e) => {
              ys.current[i] = e.nativeEvent.layout.y;
              if (i === active) setReady((n) => n + 1);
            }}
            style={[styles.line, i === active && styles.lineActive, { opacity: lyricOpacity(i, active) }]}
          >
            {line.text}
          </Text>
        ))}
        {!!desc && !isLoading && (
          <View style={styles.desc}>
            <Text style={[type.heading, { marginBottom: space.sm }]}>About this song</Text>
            <Text style={type.secondary}>{desc}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingBottom: space.md },
  pad: { paddingHorizontal: space.xl, paddingVertical: space.xl, paddingBottom: 200 },
  center: { alignItems: 'center', paddingTop: space.xxl },
  status: { color: colors.text2, fontSize: 18, textAlign: 'center', marginTop: space.xxl },
  line: { color: colors.text, fontSize: 24, fontWeight: '700', lineHeight: 32, marginBottom: space.lg },
  lineActive: { color: colors.text },
  desc: { marginTop: space.xxl },
});
