import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { getActiveProvider } from './providers';
import { useAuth } from './hooks/useAuth';
import { useGroups } from './hooks/useGroups';
import { usePlayback } from './hooks/usePlayback';
import { useMediaSession } from './hooks/useMediaSession';
import { useQueue } from './hooks/useQueue';
import { trackQueryOptions } from './hooks/useTrackDetails';
import { useEnsureFavourites } from './hooks/usePlaylists';
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
  sonosItemToNormalizedQueueItem,
} from './lib/itemHelpers';
import type { SonosItem, SonosItemId } from './types/sonos';

import { TopNav } from './components/TopNav';
import { PlayerBar } from './components/PlayerBar';
import { AmbientBackdrop } from './components/AmbientBackdrop';
import { HomePanel } from './components/HomePanel';
import { useYtmHome } from './hooks/useYtmHome';
import { AlbumPanel } from './components/album/AlbumPanel';
import { ArtistPanel } from './components/artist/ArtistPanel';
import { ContainerPanel } from './components/ContainerPanel';
import { DiscoverPanel } from './components/DiscoverPanel';
import { SearchPanel } from './components/search/SearchPanel';
import { useAutoplay } from './hooks/useAutoplay';
import type { NormalizedQueueItem } from './types/provider';
import { LeaderboardPanel } from './components/LeaderboardPanel';
import { QueuedlePanel } from './components/queuedle/QueuedlePanel';
import { QueuedleStatsPanel } from './components/queuedle/QueuedleStatsPanel';
import { MusicStatsPanel } from './components/musicStats/MusicStatsPanel';
import { QueueSidebar, type QueueSidebarHandle } from './components/queue/QueueSidebar';
import { SkinnyShell } from './components/skinny/SkinnyShell';
import { useSkinnyMode } from './hooks/useSkinnyMode';
import { MiniPlayerShell } from './components/MiniPlayer';
import { FeedbackDialog } from './components/FeedbackDialog';
import { PollAdminLauncher } from './components/polls/PollAdminLauncher';
import { ChangelogDialog } from './components/ChangelogDialog';
import { LyricsPanel } from './components/LyricsPanel';
import { useDisplayName, useDisplayNameActions, refreshDisplayName } from './hooks/useDisplayName';
import { ProfilePanel } from './components/ProfilePanel';
import { PlaylistPanel } from './components/PlaylistPanel';
import { positionAfterCurrent } from './lib/queueHelpers';
import { ContextMenuProvider } from './components/common/ContextMenu';
import { ToastProvider } from './components/common/Toast';
import { usePrefetchNextLyrics } from './hooks/usePrefetchNextLyrics';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Splash } from './components/Splash';
import { getName } from './lib/itemHelpers';
import { effectiveDockedWidth } from './lib/queueWidth';

import styles from './styles/App.module.css';

// ── Mini player window: self-contained shell ──────────────────────────────────

// ── Main app ──────────────────────────────────────────────────────────────────

const MainApp = memo(function MainApp() {
  const queryClient = useQueryClient();
  const isAuthed = useAuth();
  const groups = useGroups();
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 4000);
  }, []);
  const { playback, applyGroupCache, queueIdRef, queueVersionRef } = usePlayback(activeGroupId);
  useMediaSession(playback);
  const {
    items: queueItems,
    setItems: setQueueItems,
    isLoading: queueLoading,
    error: queueError,
    reload: reloadQueueRaw,
  } = useQueue(
    isAuthed,
    activeGroupId,
    playback.queueId,
    (etag) => {
      queueVersionRef.current = etag;
    },
    (msg) => showToast(`Queue refresh failed: ${msg}`)
  );
  usePrefetchNextLyrics(queueItems, playback.queueItemId);

  const reloadQueue = useCallback(() => {
    reloadQueueRaw();
    window.sonos.refreshAttribution().catch(() => {});
  }, [reloadQueueRaw]);

  // Reload whenever Sonos reports a new queue version — catches external adds/removes/reorders
  const seenQueueVersionRef = useRef<string | null>(null);
  useEffect(() => {
    const v = playback.queueVersion;
    if (!v || v === seenQueueVersionRef.current) return;
    seenQueueVersionRef.current = v;
    reloadQueue();
  }, [playback.queueVersion, reloadQueue]);

  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const displayName = useDisplayName(); // undefined = not yet loaded
  const displayNameActions = useDisplayNameActions();
  const [entraLoading, setEntraLoading] = useState(false);
  useEnsureFavourites(displayName);
  // The saved width is the user's preference; the state is what this window can give it
  // (effectiveDockedWidth), re-derived on every resize and never written back as the preference.
  const queueWidthPrefRef = useRef(380);
  const [queueDockedWidth, setQueueDockedWidth] = useState<number>(() => effectiveDockedWidth(380, window.innerWidth));
  const fitQueueWidth = useCallback(() => {
    setQueueDockedWidth(effectiveDockedWidth(queueWidthPrefRef.current, window.innerWidth));
  }, []);
  const queueSidebarRef = useRef<QueueSidebarHandle>(null);
  // Read inside handleAddToQueue without making it depend on queue contents —
  // it's passed to most of the tree, and rebuilding it on every queue tick would
  // churn every consumer.
  const queueItemsRef = useRef<NormalizedQueueItem[]>([]);
  const fillerUriRef = useRef<string | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const skinny = useSkinnyMode();
  const handleResizeWidthLive = useCallback((width: number) => {
    shellRef.current?.style.setProperty('--docked-queue-w', `${width}px`);
  }, []);

  useEffect(() => {
    window.sonos
      .getQueueDockedWidth()
      .then((w) => {
        queueWidthPrefRef.current = w;
        fitQueueWidth();
      })
      .catch(() => {});
    return window.sonos.onEntraReady(() => {
      void refreshDisplayName(queryClient);
    });
  }, [fitQueueWidth, queryClient]);

  useEffect(() => {
    window.addEventListener('resize', fitQueueWidth);
    fitQueueWidth();
    return () => window.removeEventListener('resize', fitQueueWidth);
  }, [fitQueueWidth]);

  const handleSetQueueDockedWidth = useCallback(
    (width: number) => {
      queueWidthPrefRef.current = width;
      fitQueueWidth();
      window.sonos.setQueueDockedWidth(width).catch(() => {});
    },
    [fitQueueWidth]
  );

  const splashReadyRef = useRef(false);
  useEffect(() => {
    const splashReady = isAuthed && groups.length > 0;
    if (!splashReady || splashReadyRef.current) return;
    splashReadyRef.current = true;
    window.sonos
      .isNewVersion()
      .then((isNew) => {
        if (isNew) setChangelogOpen(true);
      })
      .catch(() => {});
  }, [isAuthed, groups.length]);

  // Reload queue as soon as the WS session is up — catches the case where the
  // first queue load fired before the session was fully established.
  useEffect(() => {
    return window.sonos.onWsReady(() => reloadQueue());
  }, [reloadQueue]);

  useEffect(() => {
    if (groups.length === 0 || activeGroupId) return;
    getActiveProvider()
      .getActiveGroup()
      .then((savedCoordinatorId) => {
        const match = savedCoordinatorId ? groups.find((g) => g.coordinatorId === savedCoordinatorId) : null;
        setActiveGroupId(match ? match.id : groups[0].id);
      })
      .catch(() => setActiveGroupId(groups[0].id));
  }, [groups, activeGroupId]);

  useEffect(() => {
    const onFocus = () => {
      window.sonos.refreshPlayback().catch(() => {});
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // Autoplay: the coordinator picks, this client enqueues only when it holds the
  // lease. DJ picks are never attributed — they're the algorithm's choice.
  const autoplay = useAutoplay({
    groupId: activeGroupId,
    items: queueItems,
    nowPlayingUri: playback.currentObjectId,
    nowPlayingQueueItemId: playback.queueItemId,
    onEnqueue: async (track) => {
      await handleAddToQueue(
        {
          title: track.trackName,
          type: 'ITEM_TRACK',
          subtitle: track.artist,
          imageUrl: track.imageUrl,
          resource: {
            type: 'TRACK',
            id: {
              objectId: track.uri,
              serviceId: track.serviceId ?? '',
              accountId: track.accountId ?? '',
            },
          },
        } as SonosItem,
        -1,
        // djFiller: this one really does belong at the very end.
        { attribute: false, djFiller: true }
      );
    },
  });

  useEffect(() => {
    queueItemsRef.current = queueItems;
  }, [queueItems]);

  useEffect(() => {
    fillerUriRef.current = autoplay.fillerUri;
  }, [autoplay.fillerUri]);

  const handleGroupChange = useCallback(
    (groupId: string) => {
      setActiveGroupId(groupId);
      getActiveProvider().setGroup(groupId);
      applyGroupCache(groupId);
      window.sonos.refreshAttribution().catch(() => {});
      window.sonos.trackEvent('group_changed').catch(() => {});
    },
    [applyGroupCache]
  );

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

  const handleAddToQueue = useCallback(
    async (item: SonosItem, position = -1, opts?: { attribute?: boolean; djFiller?: boolean }) => {
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
        showToast('Open the station to add its songs');
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

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key === 'H') window.sonos.openHttpMonitor();
      if (e.ctrlKey && e.shiftKey && e.key === 'W') window.sonos.openWsMonitor();
      if (e.key === 'F2') setFeedbackOpen(true);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    function onUnhandledRejection(e: PromiseRejectionEvent) {
      window.sonos.trackEvent('renderer_error', { reason: String(e.reason) }).catch(() => {});
    }
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => window.removeEventListener('unhandledrejection', onUnhandledRejection);
  }, []);

  const homeEnabled = isAuthed && groups.length > 0;

  const { data: ytm, isLoading: ytmLoading } = useYtmHome(homeEnabled);

  const splashReady = isAuthed && groups.length > 0 && !ytmLoading;

  // "Queue next": straight after whatever is playing, credited like any add.
  const queueItemIdRef = useRef(playback.queueItemId);
  useEffect(() => {
    queueItemIdRef.current = playback.queueItemId;
  }, [playback.queueItemId]);
  const handleQueueNext = useCallback(
    (item: SonosItem) =>
      handleAddToQueue(item, positionAfterCurrent(queueItemIdRef.current, queueItemsRef.current.length)),
    [handleAddToQueue]
  );

  return (
    <ToastProvider>
      <ContextMenuProvider displayName={displayName} onAddToQueue={handleAddToQueue} onQueueNext={handleQueueNext}>
        <Splash ready={splashReady} />
        {skinny ? (
          <SkinnyShell
            autoplay={autoplay}
            displayName={displayName}
            isAuthed={isAuthed}
            playback={playback}
            queueItems={queueItems}
            setQueueItems={setQueueItems}
            queueLoading={queueLoading}
            queueError={queueError}
            reloadQueue={reloadQueue}
            showToast={showToast}
            groups={groups}
            activeGroupId={activeGroupId}
          />
        ) : (
          <div
            ref={shellRef}
            className={styles.shell}
            style={{ '--docked-queue-w': `${queueDockedWidth}px` } as React.CSSProperties}
          >
            <TopNav
              isAuthed={isAuthed}
              groups={groups}
              activeGroupId={activeGroupId}
              onGroupChange={handleGroupChange}
              onResync={() => window.sonos.resync()}
              displayName={displayName}
              onSaveName={(name) => {
                const stored = name.trim();
                void window.sonos
                  .setDisplayName(stored)
                  .then((result) => {
                    if (!result?.error) displayNameActions.set(stored || null);
                  })
                  .catch(() => {});
              }}
              onChangelogOpen={() => setChangelogOpen(true)}
            />
            <AmbientBackdrop nowPlayingArt={playback.artUrl} />
            <div className={styles.body}>
              <main className={styles.main}>
                <Routes>
                  <Route
                    path="/"
                    element={
                      <HomePanel
                        isAuthed={isAuthed}
                        onAddToQueue={handleAddToQueue}
                        ytm={ytm}
                        ytmLoading={ytmLoading}
                        displayName={displayName}
                        playback={playback}
                        queueItems={queueItems}
                      />
                    }
                  />
                  <Route path="/search" element={<SearchPanel onAddToQueue={handleAddToQueue} />} />
                  <Route
                    path="/discover"
                    element={
                      <DiscoverPanel
                        onAddToQueue={handleAddToQueue}
                        displayName={displayName}
                        queueItems={queueItems}
                      />
                    }
                  />
                  <Route
                    path="/album/:id"
                    element={<AlbumPanel onAddToQueue={handleAddToQueue} playback={playback} />}
                  />
                  <Route
                    path="/artist/:id"
                    element={
                      <ArtistPanel
                        onAddToQueue={handleAddToQueue}
                        currentTrackName={playback.trackName}
                        isPlaybackActive={playback.isPlaying}
                      />
                    }
                  />
                  <Route path="/container/:id" element={<ContainerPanel onAddToQueue={handleAddToQueue} />} />
                  <Route path="/leaderboard" element={<LeaderboardPanel onAddToQueue={handleAddToQueue} />} />
                  <Route path="/leaderboard/stats" element={<MusicStatsPanel />} />
                  <Route path="/queuedle" element={<QueuedlePanel />} />
                  <Route path="/queuedle/stats" element={<QueuedleStatsPanel />} />
                  <Route path="/lyrics" element={<LyricsPanel playback={playback} />} />
                  <Route
                    path="/profile/:userName"
                    element={
                      <ProfilePanel
                        onAddToQueue={handleAddToQueue}
                        displayName={displayName}
                        onSignOut={async () => {
                          displayNameActions.set(null);
                          setEntraLoading(true);
                          await window.sonos.entraSignOut().catch(() => {});
                          await window.sonos.entraReLogin().catch(() => {});
                          await displayNameActions.refresh();
                          setEntraLoading(false);
                        }}
                        onChangeName={(name) => displayNameActions.rename(displayName, name)}
                      />
                    }
                  />
                  <Route
                    path="/playlist/:id"
                    element={<PlaylistPanel displayName={displayName} onAddToQueue={handleAddToQueue} />}
                  />
                </Routes>
              </main>
              <QueueSidebar
                ref={queueSidebarRef}
                viewer={displayName}
                items={queueItems}
                setItems={setQueueItems}
                isLoading={queueLoading}
                error={queueError}
                currentObjectId={playback.currentObjectId}
                currentQueueItemId={playback.queueItemId}
                isPlaying={playback.isPlaying}
                currentTrackDurationMs={playback.durationMs}
                groupName={groups.find((g) => g.id === activeGroupId)?.name ?? null}
                onRefresh={reloadQueue}
                onError={showToast}
                onAddToQueue={handleAddToQueue}
                dockedWidth={queueDockedWidth}
                onResizeWidth={handleSetQueueDockedWidth}
                onResizeWidthLive={handleResizeWidthLive}
                autoplay={autoplay}
              />
            </div>
            <PlayerBar isAuthed={isAuthed} playback={playback} onShuffle={reloadQueue} displayName={displayName} />
          </div>
        )}
        {toastMsg && <div className={styles.toast}>{toastMsg}</div>}
        {entraLoading && (
          <div className={styles.entraSigningIn}>
            <span>Signing in with your organisation account…</span>
          </div>
        )}
        {feedbackOpen && <FeedbackDialog onClose={() => setFeedbackOpen(false)} />}
        <PollAdminLauncher />
        {changelogOpen && <ChangelogDialog onClose={() => setChangelogOpen(false)} />}
      </ContextMenuProvider>
    </ToastProvider>
  );
});

// ── Root ──────────────────────────────────────────────────────────────────────

export function App() {
  const location = useLocation();
  return location.pathname === '/mini' ? (
    <MiniPlayerShell />
  ) : (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}
