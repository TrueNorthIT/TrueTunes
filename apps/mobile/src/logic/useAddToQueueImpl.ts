// Port of desktop MainApp handleAddToQueue + attribution + autoplay wiring (renderer/src/App.tsx).

import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRemoteContext } from './RemoteContext';
import { useToast } from './context/ToastContext';
import type { AddToQueue } from './AddToQueueContext';
import { useAutoplay } from './hooks/useAutoplay';
import { trackQueryOptions } from './hooks/useTrackDetails';
import { albumQueryOptions, type AlbumTrack } from './hooks/useAlbumBrowse';
import { playlistQueryOptions } from './hooks/usePlaylistBrowse';
import { api } from './lib/sonosApi';
import {
  normalizeForQueue,
  isTrack,
  isProgram,
  isAlbum,
  isPlaylist,
  resolveAlbumParams,
  getItemArt,
  getName,
  sonosItemToNormalizedQueueItem,
} from './lib/itemHelpers';
import type { SonosItem, SonosItemId } from './types/sonos';

export function useAddToQueueImpl(): { addToQueue: AddToQueue; autoplay: ReturnType<typeof useAutoplay> } {
  const queryClient = useQueryClient();
  const { showToast: toast } = useToast();
  const showToast = useCallback((msg: string) => toast(msg, 'error'), [toast]);
  const { activeGroupId, playback, queue, queueIdRef, queueVersionRef } = useRemoteContext();
  const { items: queueItems, setItems: setQueueItems, reload: reloadQueue, reloadRaw: reloadQueueRaw } = queue;

  // Read inside addToQueue without making it depend on queue contents.
  const queueItemsRef = useRef(queueItems);
  const fillerUriRef = useRef<string | null>(null);

  const publishTrackAttribution = useCallback(
    (trackId: string, serviceId: string, accountId: string, fallback: { trackName: string; artist?: string; imageUrl?: string }) => {
      // Cached metadata if available; otherwise publish immediately with the fallback.
      const cached = queryClient.getQueryData(trackQueryOptions(trackId, serviceId, accountId).queryKey) as
        | { trackName?: string; artist?: string; artistId?: string; albumName?: string; albumId?: string; artUrl?: string }
        | undefined;
      window.sonos
        .publishQueued({
          eventType: 'track',
          uri: trackId,
          trackName: cached?.trackName ?? fallback.trackName,
          artist: cached?.artist ?? fallback.artist ?? '',
          serviceId,
          accountId,
          artistId: cached?.artistId,
          album: cached?.albumName,
          albumId: cached?.albumId,
          imageUrl: cached?.artUrl ?? fallback.imageUrl,
        })
        .catch(() => {});
    },
    [queryClient],
  );

  /** One 'track' event per track from already-fetched album/playlist data (O(1) Sonos lookups). */
  const fanOutTrackAttribution = useCallback(
    (
      tracks: AlbumTrack[],
      context: {
        album?: string | null;
        albumId?: string | null;
        artist?: string;
        artistId?: string;
        artUrl?: string | null;
        serviceId?: string;
        accountId?: string;
      },
    ) => {
      for (const t of tracks) {
        const tid = t.id;
        if (!tid?.objectId) continue;
        window.sonos.publishQueued({
          eventType: 'track',
          uri: tid.objectId,
          trackName: t.title,
          artist: t.artists[0] ?? context.artist ?? '',
          serviceId: tid.serviceId ?? context.serviceId,
          accountId: tid.accountId?.replace(/^sn_/, '') ?? context.accountId,
          artistId: t.artistObjects?.[0]?.objectId ?? context.artistId,
          album: t.albumName ?? context.album ?? undefined,
          albumId: t.albumId ?? context.albumId ?? undefined,
          imageUrl: t.artUrl ?? context.artUrl ?? undefined,
        });
      }
    },
    [],
  );

  const addToQueue = useCallback<AddToQueue>(
    async (item, position = -1, opts) => {
      // A user pick goes in front of the autoplay filler parked at the tail.
      if (position === -1 && !opts?.djFiller && fillerUriRef.current) {
        const fillerIndex = queueItemsRef.current.findIndex((q) => q.track.id === fillerUriRef.current);
        if (fillerIndex >= 0) position = fillerIndex;
      }
      // DJ picks pass attribute:false - they are the algorithm choice, not a person's.
      const attribute = opts?.attribute !== false;
      if (isProgram(item)) {
        const rid = item.resource?.id as SonosItemId | undefined;
        const iid = typeof item.id === 'object' ? (item.id as SonosItemId) : undefined;
        const r = (await window.sonos.loadContent({
          type: item.resource?.type ?? item.type ?? 'PROGRAM',
          id: {
            objectId: rid?.objectId ?? iid?.objectId,
            accountId: rid?.accountId ?? iid?.accountId,
            serviceId: rid?.serviceId ?? iid?.serviceId,
          },
          playbackAction: 'PLAY',
          playModes: { shuffle: false },
          defaults: item.resource?.defaults ?? undefined,
          queueAction: 'REPLACE',
        })) as { error?: string } | null;
        if (r && 'error' in r && r.error) showToast('Play failed: ' + r.error);
        else reloadQueue();
        return;
      }

      const normalized = normalizeForQueue(item);
      const isSingleTrack = isTrack(item);
      const isAlbumItem = !isSingleTrack && isAlbum(item);
      const isPlaylistItem = !isSingleTrack && isPlaylist(item);

      if (isSingleTrack) {
        const insertIndex = position === -1 ? Infinity : position;
        const normalizedQueueItem = sonosItemToNormalizedQueueItem(normalized, insertIndex === Infinity ? 0 : insertIndex);
        setQueueItems((prev) => {
          if (insertIndex === Infinity || insertIndex >= prev.length) {
            return [...prev, { ...normalizedQueueItem, index: prev.length }];
          }
          const next = [...prev];
          next.splice(insertIndex, 0, { ...normalizedQueueItem, index: insertIndex });
          return next.map((it, i) => ({ ...it, index: i }));
        });

        const tid = normalized.track?.id as SonosItemId | undefined;
        if (tid?.objectId && tid?.serviceId && tid?.accountId) {
          queryClient.prefetchQuery(trackQueryOptions(tid.objectId, tid.serviceId, tid.accountId));
        }
      }

      const rid = normalized.resource?.id;
      const iid = typeof normalized.id === 'object' ? normalized.id : undefined;
      const body = {
        id: {
          objectId: rid?.objectId ?? iid?.objectId,
          serviceId: rid?.serviceId ?? iid?.serviceId,
          accountId: (rid?.accountId ?? iid?.accountId)?.replace(/^sn_/, ''),
        },
        type: (normalized.type ?? normalized.resource?.type ?? 'TRACK').replace(/^ITEM_/, ''),
      };
      let result = await api.queue.add(body, {
        queueId: queueIdRef.current ?? undefined,
        ifMatch: queueVersionRef.current ?? undefined,
        position,
      });

      let retried = false;
      if (result.error) {
        // Stale etag - refresh the queue (updates queueVersionRef via onEtag) then retry once.
        retried = true;
        await reloadQueueRaw();
        result = await api.queue.add(body, {
          queueId: queueIdRef.current ?? undefined,
          ifMatch: queueVersionRef.current ?? undefined,
          position,
        });
      }

      if (result.error) {
        showToast('Add failed: ' + result.error);
        void window.sonos.trackEvent('queue_add', { success: 'false', itemType: body.type });
        return;
      }
      if (result.etag) queueVersionRef.current = result.etag;
      void window.sonos.trackEvent('queue_add', { success: 'true', itemType: body.type });

      const uri = body.id.objectId;
      const serviceId = body.id.serviceId ?? '';
      const accountId = body.id.accountId ?? '';

      if (attribute && isSingleTrack && uri) {
        publishTrackAttribution(uri, serviceId, accountId, {
          trackName: getName(normalized),
          // Artist powers the title+artist content-key fallback (issue #84).
          artist: sonosItemToNormalizedQueueItem(normalized, 0).track.artist || undefined,
          imageUrl: getItemArt(item) ?? undefined,
        });
      } else if (attribute && isAlbumItem && uri) {
        const { albumId, serviceId: aSvc, accountId: aAcc, defaults } = resolveAlbumParams(item);
        if (albumId && aSvc && aAcc) {
          // Album-level event first (card data as fallback); fan-out track events follow async.
          window.sonos
            .publishQueued({
              eventType: 'album',
              uri,
              trackName: getName(item),
              artist: ((item as Record<string, unknown>)['subtitle'] as string) || (item.artists?.[0]?.name ?? ''),
              serviceId: aSvc,
              accountId: aAcc,
              album: getName(item),
              albumId: uri,
              imageUrl: getItemArt(item) ?? undefined,
            })
            .catch(() => {});
          queryClient
            .fetchQuery(albumQueryOptions(albumId, aSvc, aAcc, defaults))
            .then((album) => {
              const artistId = (album.artistItem?.resource?.id as SonosItemId | undefined)?.objectId;
              fanOutTrackAttribution(album.tracks, {
                album: album.title,
                albumId: uri,
                artist: album.artist,
                artistId,
                artUrl: album.artUrl,
                serviceId: aSvc,
                accountId: aAcc,
              });
            })
            .catch(() => {
              /* silent - album event already published above */
            });
        }
      } else if (attribute && isPlaylistItem) {
        // Playlists have no album rollup - fan out per-track only.
        const { albumId: pid, serviceId: pSvc, accountId: pAcc, defaults } = resolveAlbumParams(item);
        if (pid && pSvc && pAcc) {
          const doFanOut = () =>
            queryClient
              .fetchQuery(playlistQueryOptions(pid, pSvc, pAcc, defaults))
              .then((tracks) => fanOutTrackAttribution(tracks, { serviceId: pSvc, accountId: pAcc }));
          doFanOut().catch(() => {
            setTimeout(() => doFanOut().catch(() => {}), 3000);
          });
        }
      }

      if (!isSingleTrack || retried) {
        reloadQueue();
        setTimeout(reloadQueue, 1500);
      }
    },
    [
      queryClient,
      setQueueItems,
      reloadQueue,
      reloadQueueRaw,
      queueIdRef,
      queueVersionRef,
      showToast,
      publishTrackAttribution,
      fanOutTrackAttribution,
    ],
  );

  // Autoplay: the coordinator picks, this client enqueues only when it holds the lease.
  const autoplay = useAutoplay({
    groupId: activeGroupId,
    items: queueItems,
    nowPlayingUri: playback.currentObjectId,
    nowPlayingQueueItemId: playback.queueItemId,
    onEnqueue: async (track) => {
      await addToQueue(
        {
          title: track.trackName,
          type: 'ITEM_TRACK',
          subtitle: track.artist,
          imageUrl: track.imageUrl,
          resource: {
            type: 'TRACK',
            id: { objectId: track.uri, serviceId: track.serviceId ?? '', accountId: track.accountId ?? '' },
          },
        } as SonosItem,
        -1,
        { attribute: false, djFiller: true },
      );
    },
  });

  useEffect(() => {
    queueItemsRef.current = queueItems;
  }, [queueItems]);

  useEffect(() => {
    fillerUriRef.current = autoplay.fillerUri;
  }, [autoplay.fillerUri]);

  return { addToQueue, autoplay };
}
