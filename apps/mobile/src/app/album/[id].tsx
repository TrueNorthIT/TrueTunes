import { router, useLocalSearchParams } from 'expo-router';
import { ListEnd, ListStart } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useAddToQueue } from '../../logic/AddToQueueContext';
import { useAlbumBrowse } from '../../logic/hooks/useAlbumBrowse';
import type { AlbumTrack } from '../../logic/hooks/useAlbumBrowse';
import { useDominantColor } from '../../logic/hooks/useDominantColor';
import { useGeniusAlbumYear } from '../../logic/hooks/useGeniusAlbumYear';
import { usePlaylistBrowse } from '../../logic/hooks/usePlaylistBrowse';
import { useResolveAndOpen } from '../../logic/hooks/useResolveAndOpen';
import { splitArtists } from '../../logic/lib/itemHelpers';
import { useRemoteContext } from '../../logic/RemoteContext';
import type { SonosItem, SonosItemId } from '../../logic/types/sonos';
import { Art } from '../../ui/Art';
import { BrowseTrackRow } from '../../ui/detail/BrowseTrackRow';
import { Centered, DetailTopBar, PillButton, tintBackground } from '../../ui/detail/DetailChrome';
import {
  albumMetaLine,
  buildBrowseItem,
  parseDetailParams,
  totalSeconds,
  trackSheetItem,
} from '../../ui/detail/detailLogic';
import { buildDetailRoute, makeNavigate, useItemActionSheet } from '../../ui/media';
import { colors, space, type } from '../../ui/theme';

/**
 * Album detail. Sonos PLAYLIST items also route here (see routes.ts), so when the album browse
 * fails or comes back empty we retry as a playlist browse, like desktop's isPlaylistOrProgram path.
 */
export default function AlbumScreen() {
  const p = parseDetailParams(useLocalSearchParams());
  const { displayName } = useRemoteContext();
  const addToQueue = useAddToQueue();
  const { show, sheet } = useItemActionSheet(displayName);
  const [adding, setAdding] = useState(false);
  const { resolveAndOpen } = useResolveAndOpen(makeNavigate((h) => router.push(h as never)));

  const album = useAlbumBrowse(p.id, p.serviceId, p.accountId, p.defaults);
  const asPlaylist = album.isError || (album.isSuccess && album.data.tracks.length === 0);
  const playlist = usePlaylistBrowse(asPlaylist ? p.id : undefined, p.serviceId, p.accountId, p.defaults);

  const isLoading = album.isLoading || (asPlaylist && playlist.isLoading);
  const tracks: AlbumTrack[] = asPlaylist ? (playlist.data ?? []) : (album.data?.tracks ?? []);
  const failed = asPlaylist && playlist.isError;

  const title = (!asPlaylist ? album.data?.title : undefined) || p.name || '';
  const artist = (!asPlaylist ? album.data?.artist : undefined) ?? '';
  const artUrl = (!asPlaylist ? album.data?.artUrl : undefined) ?? tracks[0]?.artUrl ?? null;
  const artistItem = !asPlaylist ? (album.data?.artistItem ?? null) : null;
  const totalTracks = !asPlaylist ? (album.data?.totalTracks ?? tracks.length) : tracks.length;

  const year = useGeniusAlbumYear(asPlaylist ? null : title, asPlaylist ? null : artist);
  const tint = useDominantColor(artUrl);

  const queueItem = useMemo(
    () => buildBrowseItem(asPlaylist ? 'PLAYLIST' : 'ALBUM', p, { title }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [asPlaylist, p.id, p.serviceId, p.accountId, p.defaults, title]
  );
  const svc = tracks[0]?.id as SonosItemId | undefined;
  const ctx = useMemo(
    () => ({
      serviceId: svc?.serviceId ?? p.serviceId,
      accountId: svc?.accountId ?? p.accountId,
      includeAlbum: asPlaylist,
    }),
    [svc?.serviceId, svc?.accountId, p.serviceId, p.accountId, asPlaylist]
  );

  const addAll = async (position: number) => {
    if (!queueItem || adding) return;
    setAdding(true);
    try {
      await addToQueue(queueItem, position);
    } finally {
      setAdding(false);
    }
  };

  const openArtist = (name: string, single: boolean) => {
    if (single && artistItem) {
      const rid = artistItem.resource?.id as SonosItemId | undefined;
      const href = buildDetailRoute('artist', {
        id: rid?.objectId,
        serviceId: rid?.serviceId,
        accountId: rid?.accountId?.replace(/^sn_/, ''),
        name,
      });
      if (href) router.push(href as never);
      return;
    }
    void resolveAndOpen(name, 'artist', { serviceId: p.serviceId, accountId: p.accountId });
  };

  const artistParts = splitArtists(artist);
  const onAdd = useCallback((item: SonosItem) => void addToQueue(item), [addToQueue]);

  const header = (
    <View style={[styles.header, { backgroundColor: tintBackground(tint) }]}>
      <Art uri={artUrl} size={200} style={styles.art} />
      <Text style={[type.title, styles.center]} numberOfLines={3}>
        {title}
      </Text>
      {artistParts.length > 0 ? (
        <Text style={[type.body, styles.center]}>
          {artistParts.map((name, i) => (
            <Text key={i} style={{ color: colors.accent }} onPress={() => openArtist(name, artistParts.length === 1)}>
              {i > 0 ? ', ' : ''}
              {name}
            </Text>
          ))}
        </Text>
      ) : null}
      {tracks.length > 0 ? (
        <Text style={type.caption}>{albumMetaLine(totalTracks, totalSeconds(tracks), year)}</Text>
      ) : null}
      <View style={styles.actions}>
        <PillButton
          primary
          label={adding ? 'Adding…' : 'Add to queue'}
          icon={<ListEnd size={18} color={colors.bg} />}
          disabled={adding || !tracks.length}
          onPress={() => void addAll(-1)}
        />
        <PillButton
          label="Play next"
          icon={<ListStart size={18} color={colors.text} />}
          disabled={adding || !tracks.length}
          onPress={() => void addAll(0)}
        />
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <DetailTopBar title={title} />
      {isLoading && !tracks.length ? (
        <>
          {header}
          <Centered loading />
        </>
      ) : (
        <FlatList
          data={tracks}
          keyExtractor={(t, i) => `${t.id.objectId ?? t.ordinal}-${i}`}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <Text style={[type.secondary, styles.msg]}>{failed ? 'Failed to load tracks.' : 'No tracks found.'}</Text>
          }
          contentContainerStyle={{ paddingBottom: space.xxl }}
          renderItem={({ item: t, index }) => (
            <BrowseTrackRow
              track={t}
              ordinal={asPlaylist ? index + 1 : t.ordinal || index + 1}
              fallbackArt={artUrl}
              subtitle={
                asPlaylist ? [t.artists.join(', '), t.albumName].filter(Boolean).join(' • ') || undefined : undefined
              }
              onAdd={onAdd}
              onPress={() => show(trackSheetItem(t, ctx))}
              onLongPress={() => show(trackSheetItem(t, ctx))}
            />
          )}
        />
      )}
      {sheet}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.lg,
  },
  art: { borderRadius: 12 },
  center: { textAlign: 'center' },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.sm, flexWrap: 'wrap', justifyContent: 'center' },
  msg: { textAlign: 'center', marginTop: space.xl },
});
