import { memo } from 'react';
import { StyleSheet, Text } from 'react-native';
import type { AlbumTrack } from '../../logic/hooks/useAlbumBrowse';
import type { SonosItem } from '../../logic/types/sonos';
import { MediaRow } from '../media';
import { colors, type } from '../theme';
import { durationLabel } from './detailLogic';

/** Album / playlist / top-song row: ordinal, art (optional), title + explicit badge, artist, duration, add. */
export const BrowseTrackRow = memo(function BrowseTrackRow({
  track,
  ordinal,
  fallbackArt,
  subtitle,
  isPlaying,
  onAdd,
  onPress,
  onLongPress,
}: {
  track: AlbumTrack;
  ordinal: number;
  fallbackArt?: string | null;
  subtitle?: string;
  isPlaying?: boolean;
  onAdd: (item: SonosItem) => void;
  onPress: () => void;
  onLongPress: () => void;
}) {
  return (
    <MediaRow
      name={track.title}
      artUrl={track.artUrl ?? fallbackArt}
      explicit={track.explicit}
      isPlaying={isPlaying}
      subtitle={subtitle ?? (track.artists.join(', ') || undefined)}
      leading={<Text style={[type.caption, styles.ordinal, isPlaying && { color: colors.accent }]}>{ordinal}</Text>}
      trailing={<Text style={type.caption}>{durationLabel(track.durationSeconds)}</Text>}
      onAdd={() => onAdd(track.raw)}
      onSwipeAdd={() => onAdd(track.raw)}
      onPress={onPress}
      onLongPress={onLongPress}
    />
  );
});

const styles = StyleSheet.create({
  ordinal: { width: 24, textAlign: 'right' },
});
