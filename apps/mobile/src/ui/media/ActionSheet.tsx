// Bottom-sheet replacement for the desktop right-click ContextMenu.
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ArrowRight, Heart, ListEnd, ListPlus, ListStart, Plus } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAddToQueue } from '../../logic/AddToQueueContext';
import { favouritesId, useMyPlaylists } from '../../logic/hooks/usePlaylists';
import { getName } from '../../logic/lib/itemHelpers';
import type { SonosItem } from '../../logic/types/sonos';
import { useShowToast } from '../Toast';
import { colors, radius, space, type } from '../theme';
import { createPlaylistRoute } from '../detail/detailLogic';
import { actionsForItem, toPlaylistTrack } from './itemLogic';
import type { ItemActionKey } from './itemLogic';
import { albumRouteForItem, artistRouteForItem } from './routes';
import { haptic } from '../haptics';

export interface SheetAction {
  key: string;
  label: string;
  icon?: ReactNode;
  onPress: () => void;
}

export function ActionSheet({
  visible,
  title,
  subtitle,
  actions,
  onClose,
}: {
  visible: boolean;
  title?: string;
  subtitle?: string;
  actions: SheetAction[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close menu" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.md }]}>
        <View style={styles.grabber} />
        {title ? (
          <View style={styles.head}>
            <Text style={type.heading} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={type.secondary} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        ) : null}
        <ScrollView style={styles.list} bounces={false}>
          {actions.map((a) => (
            <Pressable
              key={a.key}
              onPress={a.onPress}
              style={({ pressed }) => [styles.action, pressed && styles.pressed]}
            >
              <View style={styles.icon}>{a.icon}</View>
              <Text style={type.body}>{a.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const ICON = { size: 20, color: colors.text2 } as const;

/**
 * Long-press menu for a Sonos item. Usage:
 *   const { show, sheet } = useItemActionSheet();  ... onLongPress={() => show(item)} ... {sheet}
 * Actions (desktop parity): Play next (position 0), Add to queue (end), Add to Favourites and
 * Add to playlist (tracks, needs displayName); plus mobile-only Go to album / Go to artist.
 */
export function useItemActionSheet(displayName?: string | null) {
  const [item, setItem] = useState<SonosItem | null>(null);
  const [mode, setMode] = useState<'main' | 'playlists'>('main');
  const addToQueue = useAddToQueue();
  const showToast = useShowToast();
  const queryClient = useQueryClient();
  const { owned, joined } = useMyPlaylists(displayName);

  const close = useCallback(() => {
    setItem(null);
    setMode('main');
  }, []);
  const show = useCallback((i: SonosItem) => {
    haptic.medium();
    setMode('main');
    setItem(i);
  }, []);

  async function addTrackTo(playlist: PlaylistMeta | { id: string; name: string; owner: string }) {
    if (!item) return;
    const track = toPlaylistTrack(item, displayName ?? '');
    close();
    try {
      await window.sonos.addTrackToPlaylist(playlist.id, track);
      queryClient.invalidateQueries({ queryKey: ['playlist', playlist.id] });
      queryClient.invalidateQueries({ queryKey: ['playlists', 'owned', playlist.owner] });
      if (displayName && playlist.owner !== displayName) {
        queryClient.invalidateQueries({ queryKey: ['playlists', 'joined', displayName] });
      }
      showToast(`Added to ${playlist.name}`, 'success');
    } catch {
      showToast(`Failed to add to ${playlist.name}`, 'error');
    }
  }

  let actions: SheetAction[] = [];
  if (item) {
    const albumHref = albumRouteForItem(item);
    const artistHref = artistRouteForItem(item);
    const keys = actionsForItem(item, {
      hasAlbumRoute: !!albumHref,
      hasArtistRoute: !!artistHref,
      canPlaylist: !!displayName,
    });
    const build: Record<ItemActionKey, SheetAction> = {
      playNext: {
        key: 'playNext',
        label: 'Play next',
        icon: <ListStart {...ICON} />,
        onPress: () => {
          void addToQueue(item, 0);
          close();
        },
      },
      addToQueue: {
        key: 'addToQueue',
        label: 'Add to queue',
        icon: <ListEnd {...ICON} />,
        onPress: () => {
          void addToQueue(item, -1);
          close();
        },
      },
      goToAlbum: {
        key: 'goToAlbum',
        label: 'Go to album',
        icon: <ArrowRight {...ICON} />,
        onPress: () => {
          close();
          if (albumHref) router.push(albumHref as never);
        },
      },
      goToArtist: {
        key: 'goToArtist',
        label: 'Go to artist',
        icon: <ArrowRight {...ICON} />,
        onPress: () => {
          close();
          if (artistHref) router.push(artistHref as never);
        },
      },
      favourite: {
        key: 'favourite',
        label: 'Add to Favourites',
        icon: <Heart {...ICON} />,
        onPress: () =>
          void addTrackTo({ id: favouritesId(displayName ?? ''), name: 'Favourites', owner: displayName ?? '' }),
      },
      addToPlaylist: {
        key: 'addToPlaylist',
        label: 'Add to playlist…',
        icon: <ListPlus {...ICON} />,
        onPress: () => setMode('playlists'),
      },
    };
    actions = keys.map((k) => build[k]);
    if (mode === 'playlists') {
      actions = [...owned, ...joined].map((pl) => ({
        key: pl.id,
        label: pl.name,
        icon: <Plus {...ICON} />,
        onPress: () => void addTrackTo(pl),
      }));
      actions.push({
        key: 'create-playlist',
        label: 'Create new playlist',
        icon: <Plus {...ICON} />,
        onPress: () => {
          const track = toPlaylistTrack(item, displayName ?? '');
          close();
          router.push(createPlaylistRoute(track) as never);
        },
      });
    }
  }

  const sheet = (
    <ActionSheet
      visible={!!item}
      title={item ? (mode === 'playlists' ? 'Add to playlist' : getName(item)) : undefined}
      subtitle={item && mode === 'main' ? undefined : undefined}
      actions={actions}
      onClose={close}
    />
  );
  return { show, sheet };
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: colors.bg1,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '70%',
    paddingTop: space.sm,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border2,
    marginBottom: space.sm,
  },
  head: {
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  list: { flexGrow: 0 },
  action: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg },
  pressed: { backgroundColor: colors.bg2 },
  icon: { width: 24, alignItems: 'center' },
});
