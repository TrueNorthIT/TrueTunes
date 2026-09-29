import { useQueryClient } from '@tanstack/react-query';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowDown, ArrowUp, Camera, ListEnd, ListStart, Trash2, User, X } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAddToQueue } from '../../logic/AddToQueueContext';
import { useTrackDetails } from '../../logic/hooks/useTrackDetails';
import { usePlaylist } from '../../logic/hooks/usePlaylists';
import { useRemoteContext } from '../../logic/RemoteContext';
import { Art } from '../../ui/Art';
import { Centered, DetailTopBar, PillButton } from '../../ui/detail/DetailChrome';
import {
  canMoveDown,
  canMoveUp,
  flatPlaylistColour,
  moveItem,
  parseDetailParams,
  playlistMetaParts,
  playlistTrackToItem,
} from '../../ui/detail/detailLogic';
import { ActionSheet, MediaRow, routeForProfile } from '../../ui/media';
import type { SheetAction } from '../../ui/media';
import { useShowToast } from '../../ui/Toast';
import { colors, radius, space, type } from '../../ui/theme';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ICON = { size: 20, color: colors.text2 } as const;

function PlaylistTrackRow({
  track,
  index,
  isOwner,
  onAdd,
  onRemove,
  onMenu,
}: {
  track: PlaylistTrack;
  index: number;
  isOwner: boolean;
  onAdd: () => void;
  onRemove: () => void;
  onMenu: () => void;
}) {
  const { data: details } = useTrackDetails(track.uri, track.serviceId, track.accountId);
  const name = details?.trackName ?? track.trackName;
  const artist = details?.artist ?? track.artist;
  return (
    <MediaRow
      name={name}
      artUrl={details?.artUrl ?? track.imageUrl}
      subtitle={[artist, track.addedBy ? `added by ${track.addedBy}` : ''].filter(Boolean).join(' • ')}
      leading={<Text style={[type.caption, styles.ordinal]}>{index + 1}</Text>}
      trailing={
        isOwner ? (
          <Pressable onPress={onRemove} hitSlop={4} style={styles.iconBtn} accessibilityLabel="Remove track">
            <X size={18} color={colors.text3} />
          </Pressable>
        ) : undefined
      }
      onAdd={onAdd}
      onSwipeAdd={onAdd}
      onPress={onMenu}
      onLongPress={onMenu}
    />
  );
}

export default function PlaylistScreen() {
  const { id } = parseDetailParams(useLocalSearchParams());
  const { displayName } = useRemoteContext();
  const addToQueue = useAddToQueue();
  const showToast = useShowToast();
  const queryClient = useQueryClient();
  const { data: playlist, isLoading, isError } = usePlaylist(id);
  const [menuIndex, setMenuIndex] = useState<number | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [uploading, setUploading] = useState(false);

  const isOwner = !!playlist && playlist.owner === displayName;
  const isMember = playlist?.members.includes(displayName ?? '') ?? false;
  const canReorder = isOwner || isMember;
  const tracks = useMemo(() => playlist?.tracks ?? [], [playlist]);

  const invalidateOwned = useCallback(
    (owner?: string) => queryClient.invalidateQueries({ queryKey: ['playlists', 'owned', owner ?? displayName] }),
    [queryClient, displayName],
  );

  async function playAll() {
    for (const t of tracks) await addToQueue(playlistTrackToItem(t), -1);
  }

  async function toggleMembership() {
    if (!id || !displayName) return;
    try {
      await window.sonos.joinPlaylist(id, isMember ? 'leave' : 'join');
      queryClient.invalidateQueries({ queryKey: ['playlist', id] });
      queryClient.invalidateQueries({ queryKey: ['playlists', 'joined', displayName] });
    } catch {
      showToast(isMember ? 'Failed to leave playlist' : 'Failed to join playlist', 'error');
    }
  }

  async function patch(change: { name?: string; isPublic?: boolean }, failMsg: string) {
    if (!id || !playlist) return;
    const snapshot = playlist;
    queryClient.setQueryData(['playlist', id], { ...playlist, ...change });
    try {
      await window.sonos.updatePlaylist(id, change);
      invalidateOwned();
    } catch {
      queryClient.setQueryData(['playlist', id], snapshot);
      showToast(failMsg, 'error');
    }
  }

  function commitRename() {
    const trimmed = renameValue.trim();
    setRenaming(false);
    if (!trimmed || !playlist || trimmed === playlist.name) return;
    void patch({ name: trimmed }, 'Failed to rename playlist');
  }

  async function removeTrack(index: number) {
    if (!id || !playlist) return;
    const uri = playlist.tracks[index]?.uri;
    if (!uri) return;
    const snapshot = playlist;
    queryClient.setQueryData<PlaylistDoc>(['playlist', id], { ...playlist, tracks: playlist.tracks.filter((_, i) => i !== index) });
    try {
      await window.sonos.removeTrackFromPlaylist(id, uri);
      invalidateOwned();
    } catch {
      queryClient.setQueryData(['playlist', id], snapshot);
      showToast('Failed to remove track', 'error');
    }
  }

  // Touch replacement for desktop drag-and-drop: move up/down from the row menu.
  async function moveTrack(from: number, to: number) {
    if (!id || !playlist) return;
    const snapshot = playlist;
    queryClient.setQueryData(['playlist', id], { ...playlist, tracks: moveItem(playlist.tracks, from, to) });
    try {
      await window.sonos.reorderPlaylistTracks(id, from, to);
      queryClient.invalidateQueries({ queryKey: ['playlist', id] });
      invalidateOwned();
    } catch {
      queryClient.setQueryData(['playlist', id], snapshot);
      showToast('Failed to reorder tracks', 'error');
    }
  }

  function confirmDelete() {
    if (!id || !playlist) return;
    Alert.alert('Delete playlist', `Delete "${playlist.name}" forever?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await window.sonos.deletePlaylist(id);
            queryClient.removeQueries({ queryKey: ['playlist', id] });
            invalidateOwned(playlist.owner);
            router.back();
          } catch {
            showToast('Failed to delete playlist', 'error');
          }
        },
      },
    ]);
  }

  async function changeCover() {
    if (!id || uploading) return;
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (picked.canceled || !picked.assets[0]) return;
      setUploading(true);
      const asset = picked.assets[0];
      const out = await ImageManipulator.manipulateAsync(asset.uri, asset.width > 1000 ? [{ resize: { width: 1000 } }] : [], {
        compress: 0.85,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      const buffer = await (await fetch(out.uri)).arrayBuffer();
      if (buffer.byteLength > MAX_IMAGE_BYTES) {
        showToast('Image must be under 5 MB', 'error');
        return;
      }
      const result = await window.sonos.uploadPlaylistImage(id, buffer, 'image/jpeg', displayName ?? '');
      if (result && 'imageUrl' in result) queryClient.invalidateQueries({ queryKey: ['playlist', id] });
      else if (result && 'error' in result) showToast(result.error, 'error');
    } catch {
      showToast('Failed to upload image', 'error');
    } finally {
      setUploading(false);
    }
  }

  const menuTrack = menuIndex !== null ? tracks[menuIndex] : undefined;
  const menuActions: SheetAction[] = [];
  if (menuTrack && menuIndex !== null) {
    const item = playlistTrackToItem(menuTrack);
    const close = () => setMenuIndex(null);
    menuActions.push(
      { key: 'next', label: 'Play next', icon: <ListStart {...ICON} />, onPress: () => { close(); void addToQueue(item, 0); } },
      { key: 'queue', label: 'Add to queue', icon: <ListEnd {...ICON} />, onPress: () => { close(); void addToQueue(item, -1); } },
    );
    if (canReorder && canMoveUp(menuIndex)) {
      menuActions.push({ key: 'up', label: 'Move up', icon: <ArrowUp {...ICON} />, onPress: () => { close(); void moveTrack(menuIndex, menuIndex - 1); } });
    }
    if (canReorder && canMoveDown(menuIndex, tracks.length)) {
      menuActions.push({ key: 'down', label: 'Move down', icon: <ArrowDown {...ICON} />, onPress: () => { close(); void moveTrack(menuIndex, menuIndex + 1); } });
    }
    if (menuTrack.addedBy) {
      menuActions.push({ key: 'by', label: `Added by ${menuTrack.addedBy}`, icon: <User {...ICON} />, onPress: () => { close(); router.push(routeForProfile(menuTrack.addedBy) as never); } });
    }
    if (isOwner) {
      menuActions.push({ key: 'remove', label: 'Remove from playlist', icon: <Trash2 {...ICON} />, onPress: () => { close(); void removeTrack(menuIndex); } });
    }
  }

  const header = playlist ? (
    <View style={styles.header}>
      <Pressable onPress={isOwner ? () => void changeCover() : undefined} disabled={!isOwner || uploading} accessibilityLabel={isOwner ? 'Change cover image' : undefined}>
        {playlist.imageUrl ? (
          <Art uri={playlist.imageUrl} size={180} />
        ) : (
          <View style={[styles.tile, { backgroundColor: playlist.isFavourites ? 'hsl(340,60%,30%)' : flatPlaylistColour(playlist.name) }]}>
            <Text style={styles.tileText}>{playlist.isFavourites ? '❤️' : (playlist.name[0] ?? '?').toUpperCase()}</Text>
          </View>
        )}
        {isOwner ? (
          <View style={styles.camera}>{uploading ? <ActivityIndicator color={colors.text} /> : <Camera size={18} color={colors.text} />}</View>
        ) : null}
      </Pressable>
      <Text style={type.caption}>{playlist.isFavourites ? 'FAVOURITES' : 'PLAYLIST'}</Text>
      {renaming ? (
        <TextInput
          value={renameValue}
          onChangeText={setRenameValue}
          onSubmitEditing={commitRename}
          onBlur={commitRename}
          autoFocus
          selectTextOnFocus
          returnKeyType="done"
          style={styles.renameInput}
          selectionColor={colors.accent}
        />
      ) : (
        <Text
          style={[type.title, styles.center]}
          numberOfLines={2}
          onPress={isOwner ? () => { setRenameValue(playlist.name); setRenaming(true); } : undefined}
        >
          {playlist.name}
        </Text>
      )}
      <Text style={[type.secondary, styles.center]}>
        <Text style={{ color: colors.accent }} onPress={() => router.push(routeForProfile(playlist.owner) as never)}>
          {playlist.owner}
        </Text>
        {' • ' + playlistMetaParts(playlist).join(' • ')}
      </Text>
      <View style={styles.actions}>
        {tracks.length > 0 ? <PillButton primary label="Play all" onPress={() => void playAll()} /> : null}
        {playlist.isPublic && !isOwner ? <PillButton label={isMember ? 'Leave' : 'Join'} onPress={() => void toggleMembership()} /> : null}
        {isOwner && !playlist.isFavourites ? (
          <PillButton label={playlist.isPublic ? 'Make private' : 'Make public'} onPress={() => void patch({ isPublic: !playlist.isPublic }, 'Failed to update visibility')} />
        ) : null}
        {isOwner && !playlist.isFavourites ? <PillButton danger label="Delete" onPress={confirmDelete} /> : null}
      </View>
    </View>
  ) : null;

  const footer =
    playlist?.isPublic && isOwner && playlist.members.length > 1 ? (
      <View style={{ marginTop: space.lg }}>
        <Text style={[type.heading, styles.sectionTitle]}>Members</Text>
        <View style={styles.members}>
          {playlist.members.map((m) => (
            <Pressable key={m} style={styles.chip} onPress={() => router.push(routeForProfile(m) as never)}>
              <Text style={type.secondary}>{m}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    ) : null;

  return (
    <View style={styles.root}>
      <DetailTopBar title={playlist?.name} />
      {isLoading ? (
        <Centered loading />
      ) : isError || !playlist ? (
        <Centered message="Playlist not found." />
      ) : (
        <FlatList
          data={tracks}
          keyExtractor={(t, i) => `${t.uri}-${t.addedAt}-${i}`}
          ListHeaderComponent={header}
          ListFooterComponent={footer}
          ListEmptyComponent={<Text style={[type.secondary, styles.msg]}>No tracks yet. Long-press any song and choose "Add to playlist".</Text>}
          contentContainerStyle={{ paddingBottom: space.xxl }}
          renderItem={({ item: t, index }) => (
            <PlaylistTrackRow
              track={t}
              index={index}
              isOwner={isOwner}
              onAdd={() => void addToQueue(playlistTrackToItem(t), -1)}
              onRemove={() => void removeTrack(index)}
              onMenu={() => setMenuIndex(index)}
            />
          )}
        />
      )}
      <ActionSheet visible={!!menuTrack} title={menuTrack?.trackName} subtitle={menuTrack?.artist} actions={menuActions} onClose={() => setMenuIndex(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.lg },
  tile: { width: 180, height: 180, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  tileText: { fontSize: 64, color: colors.text, fontWeight: '700' },
  camera: { position: 'absolute', right: 8, bottom: 8, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
  renameInput: { alignSelf: 'stretch', color: colors.text, fontSize: 22, fontWeight: '700', textAlign: 'center', borderBottomWidth: 1, borderBottomColor: colors.border2, paddingVertical: space.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center', marginTop: space.sm },
  ordinal: { width: 24, textAlign: 'right' },
  iconBtn: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  msg: { textAlign: 'center', marginTop: space.xl, paddingHorizontal: space.lg },
  sectionTitle: { paddingHorizontal: space.lg, marginBottom: space.sm },
  members: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingHorizontal: space.lg },
  chip: { minHeight: 36, justifyContent: 'center', paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: colors.bg2 },
});
