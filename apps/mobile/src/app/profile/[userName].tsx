import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';
import { Camera } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useGameRankings } from '../../logic/hooks/useDailyGame';
import { useMyPlaylists } from '../../logic/hooks/usePlaylists';
import { useUserProfile, useInvalidateUserProfile } from '../../logic/hooks/useUserProfile';
import { useUserStats } from '../../logic/hooks/useUserStats';
import { normalizeAvatar, setImageResizer } from '../../logic/lib/avatarImage';
import { plural, tierEmoji } from '../../logic/lib/socialFormat';
import { useRemoteContext } from '../../logic/RemoteContext';
import { Art } from '../../ui/Art';
import { Button, ScreenHeader, SectionTitle, UserAvatar, inputStyle } from '../../ui/social/common';
import { expoImageResizer } from '../../ui/social/imageResizer';
import type { UriAvatarFile } from '../../ui/social/imageResizer';
import { useShowToast } from '../../ui/Toast';
import { colors, radius, space, type } from '../../ui/theme';

// Register the expo-image-manipulator resizer (centre-crop 512px WebP) for avatar uploads.
setImageResizer(expoImageResizer);

function CreatePlaylistModal({ owner, onClose }: { owner: string; onClose: () => void }) {
  const [name, setName] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const qc = useQueryClient();
  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setErr('');
    try {
      await window.sonos.createPlaylist(name.trim(), isPublic);
      await qc.invalidateQueries({ queryKey: ['playlists', 'owned', owner] });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.dialog} onPress={() => {}}>
          <Text style={type.heading}>New playlist</Text>
          <TextInput style={inputStyle} value={name} onChangeText={setName} placeholder="Playlist name" placeholderTextColor={colors.text3} autoFocus maxLength={60} />
          <View style={styles.between}>
            <Text style={type.body}>Public</Text>
            <Switch value={isPublic} onValueChange={setIsPublic} />
          </View>
          {!!err && <Text style={{ color: colors.danger }}>{err}</Text>}
          <Button label={busy ? 'Creating...' : 'Create'} onPress={() => void create()} disabled={!name.trim() || busy} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Port of desktop ProfilePanel. */
export default function ProfileScreen() {
  const { userName: raw } = useLocalSearchParams<{ userName: string }>();
  const userName = raw ? decodeURIComponent(String(raw)) : undefined;
  const { displayName, setDisplayName } = useRemoteContext();
  const showToast = useShowToast();
  const isOwn = !!displayName && displayName === userName;

  const stats = useUserStats(userName, 25);
  const { data: rankings } = useGameRankings(userName, !!userName);
  const ranking = rankings?.find((r) => r.userName === userName) ?? null;
  const { data: profile } = useUserProfile(userName);
  const invalidateProfile = useInvalidateUserProfile();
  const { owned, joined } = useMyPlaylists(userName);
  const playlists = (isOwn ? [...owned, ...joined] : owned.filter((p) => p.isPublic)).sort((a, b) => {
    if (!!b.isFavourites !== !!a.isFavourites) return b.isFavourites ? 1 : -1;
    return b.updatedAt - a.updatedAt;
  });

  const [uploading, setUploading] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameSaving, setRenameSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  if (!userName) return null;

  const pickAvatar = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 });
      if (res.canceled || !res.assets[0]) return;
      const a = res.assets[0];
      setUploading(true);
      const file: UriAvatarFile = {
        uri: a.uri,
        width: a.width,
        height: a.height,
        type: a.mimeType ?? 'image/jpeg',
        arrayBuffer: async () => (await fetch(a.uri)).arrayBuffer(),
      };
      const { buffer, mimeType } = await normalizeAvatar(file);
      const result = await window.sonos.uploadProfileImage(userName, buffer, mimeType);
      if (result && 'error' in result) showToast('Could not upload photo', 'error');
      else invalidateProfile(userName);
    } catch {
      showToast('Could not upload photo', 'error');
    } finally {
      setUploading(false);
    }
  };

  const submitRename = async () => {
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    setRenameSaving(true);
    setRenameError(null);
    const result = await window.sonos.renameUser(displayName ?? '', trimmed).catch(() => ({ error: 'network' }));
    setRenameSaving(false);
    if (result?.error === 'taken') setRenameError('That name is already taken.');
    else if (result?.error) setRenameError('Could not rename. Try again.');
    else {
      setDisplayName(trimmed);
      setRenaming(false);
      router.replace(`/profile/${encodeURIComponent(trimmed)}` as Href);
    }
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title="Profile" />
      <ScrollView contentContainerStyle={styles.pad}>
        <View style={styles.head}>
          <Pressable disabled={!isOwn || uploading} onPress={() => void pickAvatar()} accessibilityLabel={isOwn ? 'Change photo' : undefined}>
            <UserAvatar name={userName} uri={profile?.imageUrl} size={88} />
            {isOwn && (
              <View style={styles.camera}>
                {uploading ? <ActivityIndicator size="small" color={colors.text} /> : <Camera size={14} color={colors.text} />}
              </View>
            )}
          </Pressable>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={type.title} numberOfLines={1}>{userName}</Text>
            <Text style={type.secondary}>
              {stats.totalEvents > 0 ? `${stats.totalEvents.toLocaleString()} plays` : ' '}
            </Text>
            {isOwn && !renaming && (
              <Pressable onPress={() => { setRenameValue(userName); setRenaming(true); }}>
                <Text style={{ color: colors.accent, fontSize: 13 }}>Change name</Text>
              </Pressable>
            )}
          </View>
        </View>

        {renaming && (
          <View style={{ gap: space.sm, marginTop: space.md }}>
            <TextInput style={inputStyle} value={renameValue} onChangeText={(t) => { setRenameValue(t); setRenameError(null); }} maxLength={32} autoFocus autoCorrect={false} />
            {!!renameError && <Text style={{ color: colors.danger, fontSize: 13 }}>{renameError}</Text>}
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <View style={{ flex: 1 }}><Button label={renameSaving ? '...' : 'Save'} onPress={() => void submitRename()} disabled={!renameValue.trim() || renameSaving} /></View>
              <Pressable style={styles.cancel} onPress={() => { setRenaming(false); setRenameError(null); }}>
                <Text style={type.body}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        )}

        {ranking && (
          <View style={styles.rank}>
            <Text style={{ fontSize: 28 }}>{ranking.isProvisional ? '🎵' : tierEmoji(ranking.tierKey)}</Text>
            <View>
              <Text style={type.heading}>{ranking.isProvisional ? 'Provisional' : ranking.tierName}</Text>
              <Text style={type.secondary}>
                {ranking.isProvisional
                  ? `${plural(ranking.gamesPlayed, 'game')} played`
                  : `${ranking.averagePercent.toFixed(0)}% avg · best ${ranking.bestTotal} · ${plural(ranking.gamesPlayed, 'game')}`}
              </Text>
            </View>
          </View>
        )}

        {stats.isLoading && <ActivityIndicator color={colors.text2} style={{ marginTop: space.xl }} />}

        {stats.topTracks.length > 0 && (
          <>
            <SectionTitle>Top tracks</SectionTitle>
            {stats.topTracks.slice(0, 10).map((t, i) => (
              <View key={i} style={styles.row}>
                <Art uri={t.imageUrl} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={type.body} numberOfLines={1}>{t.trackName}</Text>
                  <Text style={type.caption} numberOfLines={1}>{[t.artist, t.album].filter(Boolean).join(' · ')}</Text>
                </View>
                <Text style={type.secondary}>{t.count}x</Text>
              </View>
            ))}
          </>
        )}

        {stats.artistItems.length > 0 && (
          <>
            <SectionTitle>Top artists</SectionTitle>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.md }}>
              {stats.artistItems.map((a, i) => (
                <View key={i} style={styles.card}>
                  <Art uri={a.imageUrl} size={96} round />
                  <Text style={[type.secondary, { textAlign: 'center' }]} numberOfLines={2}>{a.name}</Text>
                </View>
              ))}
            </ScrollView>
          </>
        )}

        {stats.albumItems.length > 0 && (
          <>
            <SectionTitle>Top albums</SectionTitle>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.md }}>
              {stats.albumItems.map((a, i) => (
                <View key={i} style={styles.card}>
                  <Art uri={a.imageUrl} size={96} />
                  <Text style={[type.secondary, { textAlign: 'center' }]} numberOfLines={2}>{a.name}</Text>
                </View>
              ))}
            </ScrollView>
          </>
        )}

        {(playlists.length > 0 || isOwn) && (
          <>
            <View style={[styles.between, { marginTop: space.lg }]}>
              <Text style={type.heading}>Playlists</Text>
              {isOwn && (
                <Pressable hitSlop={8} onPress={() => setCreateOpen(true)}>
                  <Text style={{ color: colors.accent, fontSize: 14 }}>+ New</Text>
                </Pressable>
              )}
            </View>
            {playlists.map((p) => (
              <Pressable key={p.id} style={styles.row} onPress={() => router.push(`/playlist/${p.id}` as Href)}>
                <Art uri={p.imageUrl} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={type.body} numberOfLines={1}>{p.isFavourites ? 'Favourites' : p.name}</Text>
                  <Text style={type.caption}>{plural(p.trackCount, 'track')}{p.isPublic ? ' · Public' : ''}</Text>
                </View>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>
      {createOpen && displayName ? <CreatePlaylistModal owner={displayName} onClose={() => setCreateOpen(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  pad: { paddingHorizontal: space.lg, paddingBottom: space.xxl * 2 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  camera: { position: 'absolute', right: 0, bottom: 0, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  rank: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.bg1, borderRadius: radius.lg, padding: space.md, marginTop: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  card: { width: 100, alignItems: 'center', gap: space.xs },
  cancel: { paddingHorizontal: space.lg, justifyContent: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: space.lg },
  dialog: { backgroundColor: colors.bg1, borderRadius: radius.lg, padding: space.lg, gap: space.md },
});
