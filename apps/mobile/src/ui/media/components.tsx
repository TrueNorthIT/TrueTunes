// Presentational media components ported from the desktop MediaRow / MediaCard / CardRow /
// PlaylistCard / ArtistCircle / ExplicitBadge. Touch: rows >= 56px, add buttons 44px hit area,
// long-press replaces right-click.
import { Plus } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useArtistImage } from '../../logic/hooks/useArtistBrowse';
import { browseSub, getItemArt, getName, isArtist } from '../../logic/lib/itemHelpers';
import { getPlaylistColor } from '../../logic/lib/playlistColor';
import type { SonosItem, SonosItemId } from '../../logic/types/sonos';
import { Art } from '../Art';
import { SwipeRow } from '../SwipeRow';
import { colors, radius, space, type } from '../theme';
import { haptic } from '../haptics';

export function ExplicitBadge() {
  return (
    <View style={styles.explicit} accessibilityLabel="Explicit">
      <Text style={styles.explicitText}>E</Text>
    </View>
  );
}

export function AddButton({ onPress, size = 44 }: { onPress: () => void; size?: number }) {
  return (
    <Pressable
      onPress={() => {
        haptic.light();
        onPress();
      }}
      accessibilityLabel="Add to queue"
      style={({ pressed }) => [styles.addBtn, { width: size, height: size }, pressed && { opacity: 0.6 }]}
    >
      <Plus size={20} color={colors.text} />
    </Pressable>
  );
}

// ─── MediaRow ────────────────────────────────────────────────────────────────

export interface MediaRowProps {
  name: string;
  artUrl?: string | null;
  explicit?: boolean;
  isPlaying?: boolean;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onAdd?: () => void;
  /** Swipe right adds to queue. Only set for single tracks. */
  onSwipeAdd?: () => void;
  onPress?: () => void;
  onLongPress?: () => void;
}

export function MediaRow({ name, artUrl, explicit, isPlaying, subtitle, leading, trailing, onAdd, onSwipeAdd, onPress, onLongPress }: MediaRowProps) {
  const row = (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => [styles.row, isPlaying && styles.rowPlaying, pressed && styles.rowPressed]}
    >
      {leading}
      <Art uri={artUrl} size={44} />
      <View style={styles.rowText}>
        <View style={styles.nameLine}>
          <Text style={[type.body, styles.flexShrink, isPlaying && { color: colors.accent }]} numberOfLines={1}>
            {name}
          </Text>
          {explicit ? <ExplicitBadge /> : null}
        </View>
        {subtitle ? (
          <Text style={type.secondary} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
      {onAdd ? <AddButton onPress={onAdd} /> : null}
    </Pressable>
  );
  return onSwipeAdd ? <SwipeRow onSwipeRight={onSwipeAdd}>{row}</SwipeRow> : row;
}

// ─── MediaCard ───────────────────────────────────────────────────────────────

export interface MediaCardProps {
  name: string;
  sub?: string;
  artUrl?: string | null;
  circular?: boolean;
  size?: number;
  explicit?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  onAdd?: () => void;
  /** Replaces the art (used by PlaylistCard's coloured tile). */
  artSlot?: ReactNode;
}

export function MediaCard({ name, sub, artUrl, circular, size = 140, explicit, onPress, onLongPress, onAdd, artSlot }: MediaCardProps) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => [{ width: size }, pressed && { opacity: 0.7 }]}
    >
      <View>
        {artSlot ?? <Art uri={artUrl} size={size} round={circular} />}
        {onAdd ? (
          <View style={styles.cardAdd}>
            <AddButton onPress={onAdd} size={36} />
          </View>
        ) : null}
      </View>
      <View style={[styles.nameLine, circular && { justifyContent: 'center' }, { marginTop: space.sm }]}>
        <Text style={[type.body, styles.cardName, circular && { textAlign: 'center' }]} numberOfLines={1}>
          {name}
        </Text>
        {explicit ? <ExplicitBadge /> : null}
      </View>
      {sub ? (
        <Text style={[type.caption, circular && { textAlign: 'center' }]} numberOfLines={2}>
          {sub}
        </Text>
      ) : null}
    </Pressable>
  );
}

// ─── ArtistCircle ────────────────────────────────────────────────────────────

/** Artist items rarely carry an image, so (like desktop) fetch it from the artist endpoint. */
function useItemArtistArt(item: SonosItem): string | null {
  const rid = (item.resource?.id ?? (typeof item.id === 'object' ? item.id : undefined)) as SonosItemId | undefined;
  const { data } = useArtistImage(rid?.objectId, rid?.serviceId, rid?.accountId, item.resource?.defaults as string | undefined);
  return data ?? getItemArt(item);
}

export function ArtistCircle({
  artist,
  size = 96,
  onPress,
  onLongPress,
}: {
  artist: SonosItem;
  size?: number;
  onPress?: (item: SonosItem) => void;
  onLongPress?: (item: SonosItem) => void;
}) {
  const art = useItemArtistArt(artist);
  return (
    <MediaCard
      name={getName(artist)}
      artUrl={art}
      circular
      size={size}
      onPress={onPress ? () => onPress(artist) : undefined}
      onLongPress={onLongPress ? () => onLongPress(artist) : undefined}
    />
  );
}

// ─── PlaylistCard (TrueTunes custom playlists) ───────────────────────────────

export function PlaylistCard({
  pl,
  displayName,
  size = 140,
  onPress,
  onLongPress,
}: {
  pl: PlaylistMeta;
  displayName?: string | null;
  size?: number;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const meta =
    `${pl.trackCount} track${pl.trackCount !== 1 ? 's' : ''}` +
    (displayName !== undefined && pl.owner !== displayName ? ` · ${pl.owner}` : '') +
    (!pl.isPublic ? ' · Private' : '');
  const tile = pl.imageUrl ? undefined : (
    <PlaylistTile pl={pl} size={size} />
  );
  return <MediaCard name={pl.name} sub={meta} artUrl={pl.imageUrl} size={size} artSlot={tile} onPress={onPress} onLongPress={onLongPress} />;
}

/** The desktop gradient tile: the CSS linear-gradient has no RN equivalent without a native dep,
 *  so we use a flat colour parsed from the same hue hash. */
function PlaylistTile({ pl, size }: { pl: PlaylistMeta; size: number }) {
  const bg = pl.isFavourites ? 'hsl(340,60%,30%)' : flatColour(pl.name);
  return (
    <View style={[styles.tile, { width: size, height: size, backgroundColor: bg }]}>
      <Text style={{ fontSize: size * 0.35, color: colors.text, fontWeight: '700' }}>
        {pl.isFavourites ? '❤️' : (pl.name[0] ?? '?').toUpperCase()}
      </Text>
    </View>
  );
}

function flatColour(name: string): string {
  // getPlaylistColor returns "linear-gradient(135deg, hsl(H,45%,28%), ...)": reuse its first stop.
  const m = /hsl\([^)]+\)/.exec(getPlaylistColor(name));
  return m ? m[0] : colors.bg1;
}

// ─── CardRow ─────────────────────────────────────────────────────────────────

export function CardRow({
  items,
  isLoading,
  onOpen,
  onAdd,
  onLongPress,
  cardSize = 140,
}: {
  items: SonosItem[];
  isLoading?: boolean;
  onOpen: (item: SonosItem) => void;
  onAdd?: (item: SonosItem) => void;
  onLongPress?: (item: SonosItem) => void;
  cardSize?: number;
}) {
  if (isLoading) {
    return (
      <View style={[styles.cardRow, { height: cardSize + 40 }]}>
        <ActivityIndicator color={colors.text3} />
      </View>
    );
  }
  if (!items.length) return null;
  return (
    <FlatList
      horizontal
      data={items}
      keyExtractor={(item, i) => `${getName(item)}-${i}`}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.cardRowContent}
      renderItem={({ item }) =>
        isArtist(item) ? (
          <ArtistCircle artist={item} size={cardSize} onPress={onOpen} onLongPress={onLongPress} />
        ) : (
          <MediaCard
            name={getName(item)}
            sub={browseSub(item)}
            artUrl={getItemArt(item)}
            size={cardSize}
            explicit={item.explicit}
            onPress={() => onOpen(item)}
            onLongPress={onLongPress ? () => onLongPress(item) : undefined}
            onAdd={onAdd ? () => onAdd(item) : undefined}
          />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  explicit: {
    marginLeft: 6,
    width: 14,
    height: 14,
    borderRadius: 3,
    backgroundColor: colors.text3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  explicitText: { color: colors.bg, fontSize: 9, fontWeight: '800' },
  addBtn: { alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.bg2 },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.xs,
  },
  rowPlaying: { backgroundColor: colors.bg2 },
  rowPressed: { backgroundColor: colors.bg2 },
  rowText: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: 'row', alignItems: 'center' },
  flexShrink: { flexShrink: 1 },
  cardName: { flexShrink: 1, fontSize: 14, fontWeight: '600' },
  cardAdd: { position: 'absolute', right: 4, bottom: 4 },
  tile: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  cardRow: { alignItems: 'center', justifyContent: 'center' },
  cardRowContent: { paddingHorizontal: space.lg, gap: space.md },
});
