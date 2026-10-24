import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { MutableRefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { trackQueryOptions } from './useTrackDetails';
import { albumQueryOptions, type AlbumTrack } from './useAlbumBrowse';
import { playlistQueryOptions } from './usePlaylistBrowse';
import { useToast } from '../components/common/Toast';
import { api } from '../lib/sonosApi';
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
} from '../lib/itemHelpers';
import { positionAfterCurrent } from '../lib/queueHelpers';
import type { SonosItem, SonosItemId } from '../types/sonos';
import type { NormalizedQueueItem } from '../types/provider';

export interface AddToQueueOptions {
  attribute?: boolean;
  djFiller?: boolean;
}

export type AddToQueue = (item: SonosItem, position?: number, opts?: AddToQueueOptions) => Promise<void>;

export interface QueueActions {
  addToQueue: AddToQueue;
  /** Straight after whatever is playing, credited like any add. */
  queueNext: (item: SonosItem) => Promise<void>;
}

const QueueActionsContext = createContext<QueueActions>({
  addToQueue: async () => {},
  queueNext: async () => {},
});

export const QueueActionsProvider = QueueActionsContext.Provider;

/** Add to / queue-next for the office queue. Only works under a `QueueActionsProvider`. */
export function useQueueActions() {
  return useContext(QueueActionsContext);
}

interface Deps {
  queueItems: NormalizedQueueItem[];
  setQueueItems: Dispatch<SetStateAction<NormalizedQueueItem[]>>;
  /** Reload and tell Sonos attribution to refresh. */
  reloadQueue: () => void;
  /** Reload only; resolves once the new etag is in `queueVersionRef`. */
  reloadQueueRaw: () => Promise<void> | void;
  queueIdRef: MutableRefObject<string | null>;
  queueVersionRef: MutableRefObject<string | null>;
  /** Autoplay's parked tail track; user picks go in front of it. */
  fillerUri: string | null;
  /** Sonos' own id for the playing queue entry, for `queueNext`. */
  queueItemId: string | null | undefined;
}

/**
 * The add-to-queue logic: DJ filler placement, stale-etag retry, optimistic insert and
 * attribution fan-out. Call once (in the app shell) and hand the result to `QueueActionsProvider`.
 */
export function useCreateQueueActions({
  queueItems,
  setQueueItems,
  reloadQueue,
  reloadQueueRaw,
  queueIdRef,
  queueVersionRef,
  fillerUri,
  queueItemId,
}: Deps): QueueActions {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  // Read inside addToQueue without making it depend on queue contents: it is handed to most of
  // the tree, and rebuilding it on every queue tick would churn every consumer.
  const queueItemsRef = useRef(queueItems);
  const fillerUriRef = useRef(fillerUri);
  const queueItemIdRef = useRef(queueItemId);
  useEffect(() => {
    queueItemsRef.current = queueItems;
    fillerUriRef.current = fillerUri;
    queueItemIdRef.current = queueItemId;
  }, [queueItems, fillerUri, queueItemId]);

  const publishTrackAttribution = useCallback(
    (
      trackId: string,
      serviceId: string,
      accountId: string,
      fallback: { trackName: string; artist?: string; imageUrl?: string }
    ) => {
      // Use cached metadata if available; publish immediately with fallback so attribution
      // is never lost because of a secondary metadata fetch failing.
      const cached = queryClient.getQueryData(trackQueryOptions(trackId, serviceId, accountId).queryKey);
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
    [queryClient]
  );

  /**
   * Publishes one 'track' event per track using only the AlbumTrack data
   * already returned by browseAlbum / browsePlaylist — no per-track
   * getTrackNowPlaying calls. For an N-track album this is the difference
   * between O(N) and O(1) Sonos lookups.
   */
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
      }
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
    []
  );

  const addToQueue = useCallback<AddToQueue>(
    async (item, position = -1, opts) => {
      // Autoplay parks a filler at the tail. A user's pick belongs in front of
      // it — the filler only exists because nothing else was queued, so it must
      // never jump ahead of something someone actually chose.
      if (position === -1 && !opts?.djFiller && fillerUriRef.current) {
        const fillerIndex = queueItemsRef.current.findIndex((q) => q.track.id === fillerUriRef.current);
        if (fillerIndex >= 0) position = fillerIndex;
      }
      // DJ picks pass attribute:false. They're the algorithm's choice, not a
      // person's: crediting the clicker would inflate their leaderboard count,
      // hand Queuedle wrong answers for "who queued this?", and feed the
      // recommender its own output until the corpus is mostly self-generated.
      const attribute = opts?.attribute !== false;
      // Sonos can only start a station by replacing the whole queue, and this queue is the office's.
      // Every caller routes through here, so refuse it once: a station opens as its track list instead.
      if (isProgram(item)) {
        showToast('Open the station to add its songs', 'info');
        return;
      }

      const normalized = normalizeForQueue(item);
      const isSingleTrack = isTrack(item);
      const isAlbumItem = !isSingleTrack && isAlbum(item);
      const isPlaylistItem = !isSingleTrack && isPlaylist(item);

      if (isSingleTrack) {
        const insertIndex = position === -1 ? Infinity : position;
        const normalizedQueueItem = sonosItemToNormalizedQueueItem(
          normalized,
          insertIndex === Infinity ? 0 : insertIndex
        );
        setQueueItems((prev) => {
          if (insertIndex === Infinity || insertIndex >= prev.length) {
            return [...prev, { ...normalizedQueueItem, index: prev.length }];
          }
          const next = [...prev];
          next.splice(insertIndex, 0, { ...normalizedQueueItem, index: insertIndex });
          return next.map((item, i) => ({ ...item, index: i }));
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
        // Stale etag — refresh queue (which updates queueVersionRef via onEtag) then retry once
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

      // Publish attribution — shape depends on item kind.
      const uri = body.id.objectId;
      const serviceId = body.id.serviceId ?? '';
      const accountId = body.id.accountId ?? '';

      if (attribute && isSingleTrack && uri) {
        publishTrackAttribution(uri, serviceId, accountId, {
          trackName: getName(normalized),
          // Artist powers the title+artist content-key fallback that keeps a lone
          // track's badge after Sonos re-keys its objectId (issue #84).
          artist: sonosItemToNormalizedQueueItem(normalized, 0).track.artist || undefined,
          imageUrl: getItemArt(item) ?? undefined,
        });
      } else if (attribute && isAlbumItem && uri) {
        const { albumId, serviceId: aSvc, accountId: aAcc, defaults } = resolveAlbumParams(item);
        if (albumId && aSvc && aAcc) {
          // Publish album-level event immediately with card data as fallback so attribution
          // is captured even if the album browse fails. Fan-out track events follow async.
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
              /* silent — album event already published above */
            });
        }
      } else if (attribute && isPlaylistItem) {
        // Playlists have no albumMap rollup — fan out per-track only. Each
        // playlist track already carries its own albumName/albumId/artist via
        // decoded defaults, so no per-album context is needed.
        const { albumId: pid, serviceId: pSvc, accountId: pAcc, defaults } = resolveAlbumParams(item);
        if (pid && pSvc && pAcc) {
          const doFanOut = () =>
            queryClient
              .fetchQuery(playlistQueryOptions(pid, pSvc, pAcc, defaults))
              .then((tracks) => fanOutTrackAttribution(tracks, { serviceId: pSvc, accountId: pAcc }));
          doFanOut().catch(() => {
            // Retry once after a short delay on transient failure
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
    ]
  );

  const queueNext = useCallback(
    (item: SonosItem) =>
      addToQueue(item, positionAfterCurrent(queueItemIdRef.current ?? null, queueItemsRef.current.length)),
    [addToQueue]
  );

  return useMemo(() => ({ addToQueue, queueNext }), [addToQueue, queueNext]);
}
