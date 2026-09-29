import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useAddToQueue } from '../../logic/AddToQueueContext';
import { useContainerBrowse } from '../../logic/hooks/useContainerBrowse';
import { browseSub, getItemArt, getName, isArtist, isProgram, isTrack } from '../../logic/lib/itemHelpers';
import { useRemoteContext } from '../../logic/RemoteContext';
import type { SonosItem } from '../../logic/types/sonos';
import { Centered, DetailTopBar } from '../../ui/detail/DetailChrome';
import { parseDetailParams } from '../../ui/detail/detailLogic';
import { ArtistCircle, MediaCard, routeForItem, useItemActionSheet } from '../../ui/media';
import { colors, space, type } from '../../ui/theme';

const GAP = space.md;

/** Generic browse container (ITEM_AUDIO / STUDIO / PLAYLIST / CONTAINER / SECTION): a grid of children. */
export default function ContainerScreen() {
  const p = parseDetailParams(useLocalSearchParams());
  const { displayName } = useRemoteContext();
  const addToQueue = useAddToQueue();
  const { show, sheet } = useItemActionSheet(displayName);
  const { data, isLoading, isError } = useContainerBrowse(p.id, p.serviceId, p.accountId, p.defaults);
  const { width } = useWindowDimensions();
  const cols = width >= 600 ? 3 : 2;
  const size = Math.floor((width - space.lg * 2 - GAP * (cols - 1)) / cols);

  const onAdd = useCallback((item: SonosItem) => void addToQueue(item), [addToQueue]);

  // Desktop: tracks and programs are added to the queue on tap; everything else opens.
  const press = useCallback(
    (child: SonosItem) => {
      if (isProgram(child) || isTrack(child)) {
        void addToQueue(child);
        return;
      }
      const href = routeForItem(child);
      if (href) router.push(href as never);
    },
    [addToQueue],
  );

  return (
    <View style={styles.root}>
      <DetailTopBar title={p.name ?? 'Collection'} />
      {isLoading ? (
        <Centered loading />
      ) : isError ? (
        <Centered message="Failed to load." />
      ) : data && data.length === 0 ? (
        <Centered message="This collection is empty." />
      ) : (
        <FlatList
          key={cols}
          data={data ?? []}
          numColumns={cols}
          keyExtractor={(c, i) => `${(c.id as Record<string, string> | undefined)?.objectId ?? getName(c)}-${i}`}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={{ gap: GAP }}
          ListHeaderComponent={p.name ? <Text style={[type.title, styles.title]}>{p.name}</Text> : null}
          renderItem={({ item: child }) =>
            isArtist(child) ? (
              <ArtistCircle artist={child} size={size} onPress={press} onLongPress={show} />
            ) : (
              <MediaCard
                name={getName(child)}
                sub={browseSub(child)}
                artUrl={getItemArt(child)}
                size={size}
                explicit={child.explicit}
                onPress={() => press(child)}
                onLongPress={() => show(child)}
                onAdd={() => onAdd(child)}
              />
            )
          }
        />
      )}
      {sheet}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  grid: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: GAP },
  title: { marginBottom: space.md },
});
