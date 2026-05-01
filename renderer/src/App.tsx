import { useCallback, useEffect, useRef, useState } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getActiveProvider } from './providers';
import { useAuth } from './hooks/useAuth';
import { useGroups } from './hooks/useGroups';
import { usePlayback } from './hooks/usePlayback';
import { useQueue } from './hooks/useQueue';
import { useRestoreQueueAction } from './hooks/useRestoreQueue';
import type { RestoreSummary } from './hooks/useRestoreQueue';
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
  extractItems,
  resolveAlbumParams,
  getItemArt,
  sonosItemToNormalizedQueueItem,
} from './lib/itemHelpers';
import type { SonosItem, SonosItemId } from './types/sonos';

import { TopNav } from './components/TopNav';
import { PlayerBar } from './components/PlayerBar';
import { HomePanel, fetchYtmSections } from './components/HomePanel';
import type { YtmSections } from './components/HomePanel';
import { AlbumPanel } from './components/album/AlbumPanel';
import { ArtistPanel } from './components/artist/ArtistPanel';
import { ContainerPanel } from './components/ContainerPanel';
import { LeaderboardPanel } from './components/LeaderboardPanel';
import { QueuedlePanel } from './components/queuedle/QueuedlePanel';
import { QueueSidebar, type QueueSidebarHandle } from './components/queue/QueueSidebar';
import { MiniPlayerShell } from './components/MiniPlayer';
import { DisplayNameModal } from './components/DisplayNameModal';
import { FeedbackDialog } from './components/FeedbackDialog';
import { ChangelogDialog } from './components/ChangelogDialog';
import { LyricsPanel } from './components/LyricsPanel';
import { usePrefetchNextLyrics } from './hooks/usePrefetchNextLyrics';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Splash } from './components/Splash';
import { getName } from './lib/itemHelpers';

import styles from './styles/App.module.css';

// ── Mini player window: self-contained shell ──────────────────────────────────

// ── Main app ──────────────────────────────────────────────────────────────────

function MainApp() {
  const queryClient                               = useQueryClient();
  const isAuthed                                  = useAuth();
  const groups                                    = useGroups();
  const [activeGroupId, setActiveGroupId]         = useState<string | null>(null);
  const [toastMsg, setToastMsg]                   = useState<string | null>(null);
  const toastTimer                                = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 4000);
  }, []);
  const { playback, applyGroupCache, queueIdRef, queueVersionRef } = usePlayback(activeGroupId);
  const { items: queueItems, setItems: setQueueItems, isLoading: queueLoading, error: queueError, reload: reloadQueueRaw }
                                                  = useQueue(isAuthed, activeGroupId, playback.queueId,
                                                      (etag) => { queueVersionRef.current = etag; },
                                                      (msg) => showToast(`Queue refresh failed: ${msg}`));
  const { restore: runRestore } = useRestoreQueueAction();
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

  const [queueOpen, setQueueOpen]       = useState(false);
  const [feedbackOpen, setFeedbackOpen]     = useState(false);
  const [changelogOpen, setChangelogOpen]   = useState(false);
  const [displayName, setDisplayName] = useState<string | null | undefined>(undefined); // undefined = not yet loaded

  useEffect(() => {
    window.sonos.getDisplayName().then(setDisplayName);
  }, []);

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

  const handleGroupChange = useCallback((groupId: string) => {
    setActiveGroupId(groupId);
    getActiveProvider().setGroup(groupId);
    applyGroupCache(groupId);
    window.sonos.refreshAttribution().catch(() => {});
    window.sonos.trackEvent('group_changed').catch(() => {});
  }, [applyGroupCache]);

  const publishTrackAttribution = useCallback(
    (trackId: string, serviceId: string, accountId: string, fallback: { trackName: string; imageUrl?: string }) => {
      queryClient
        .fetchQuery(trackQueryOptions(trackId, serviceId, accountId))
        .then((td) => {
          window.sonos.publishQueued({
            eventType: 'track',
            uri: trackId,
            trackName: td?.trackName ?? fallback.trackName,
            artist: td?.artist ?? '',
            serviceId,
            accountId,
            artistId: td?.artistId,
            album: td?.albumName,
            albumId: td?.albumId,
            imageUrl: td?.artUrl ?? fallback.imageUrl,
          });
        })
        .catch(() => {
          /* silent */
        });
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
    async (item: SonosItem, position = -1) => {
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

      if (isSingleTrack && uri) {
        publishTrackAttribution(uri, serviceId, accountId, {
          trackName: getName(normalized),
          imageUrl: getItemArt(item) ?? undefined,
        });
      } else if (isAlbumItem && uri) {
        // Fetch the album browse first so the rollup event has the canonical
        // artist + cover from Sonos (the card item often lacks usable art);
        // then fan out one event per track. Cache hit if the user just opened
        // the album page.
        const { albumId, serviceId: aSvc, accountId: aAcc, defaults } = resolveAlbumParams(item);
        if (albumId && aSvc && aAcc) {
          queryClient
            .fetchQuery(albumQueryOptions(albumId, aSvc, aAcc, defaults))
            .then((album) => {
              const artistId = (album.artistItem?.resource?.id as SonosItemId | undefined)?.objectId;
              window.sonos.publishQueued({
                eventType: 'album',
                uri,
                trackName: album.title || getName(item),
                artist:
                  album.artist ||
                  ((item as Record<string, unknown>)['subtitle'] as string) ||
                  (item.artists?.[0]?.name ?? ''),
                serviceId: aSvc,
                accountId: aAcc,
                artistId,
                album: album.title || getName(item),
                albumId: uri,
                imageUrl: album.artUrl ?? getItemArt(item) ?? undefined,
              });
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
              /* silent */
            });
        }
      } else if (isPlaylistItem) {
        // Playlists have no albumMap rollup — fan out per-track only. Each
        // playlist track already carries its own albumName/albumId/artist via
        // decoded defaults, so no per-album context is needed.
        const { albumId: pid, serviceId: pSvc, accountId: pAcc, defaults } = resolveAlbumParams(item);
        if (pid && pSvc && pAcc) {
          queryClient
            .fetchQuery(playlistQueryOptions(pid, pSvc, pAcc, defaults))
            .then((tracks) => fanOutTrackAttribution(tracks, { serviceId: pSvc, accountId: pAcc }))
            .catch(() => {
              /* silent */
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

  const handleRestore = useCallback(async (tracks: RecentQueuedTrack[]): Promise<RestoreSummary> => {
    const summary = await runRestore(tracks, {
      queueId: queueIdRef.current ?? undefined,
      initialEtag: queueVersionRef.current ?? undefined,
      onEtagChange: (etag) => { queueVersionRef.current = etag; },
      reloadEtag: async () => {
        await reloadQueueRaw();
        return queueVersionRef.current ?? undefined;
      },
    });
    reloadQueue();
    return summary;
  }, [runRestore, queueIdRef, queueVersionRef, reloadQueue, reloadQueueRaw]);

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

  const { data: ytm, isLoading: ytmLoading } = useQuery<YtmSections>({
    queryKey: ['ytm-home'],
    queryFn: fetchYtmSections,
    enabled: homeEnabled,
    staleTime: 5 * 60 * 1000,
  });

  const { data: history = [], isLoading: histLoading } = useQuery<SonosItem[]>({
    queryKey: ['history'],
    queryFn: async () => {
      const r = await api.content.history({ count: 20 });
      return r.error ? [] : extractItems(r.data);
    },
    enabled: homeEnabled,
    staleTime: 60 * 1000,
  });

  const splashReady = isAuthed && groups.length > 0 && !ytmLoading && !histLoading;

  return (
    <div className={styles.shell}>
      <Splash ready={splashReady} />
      <TopNav
        isAuthed={isAuthed}
        groups={groups}
        activeGroupId={activeGroupId}
        onGroupChange={handleGroupChange}
        queueOpen={queueOpen}
        onToggleQueue={() => setQueueOpen((o) => !o)}
        onResync={() => window.sonos.resync()}
        displayName={displayName}
        onSaveName={(name) => {
          window.sonos.setDisplayName(name).catch(() => {});
          setDisplayName(name);
        }}
        onChangelogOpen={() => setChangelogOpen(true)}
      />
      <div className={styles.body}>
        <Routes>
          <Route
            path="/"
            element={
              <HomePanel
                isAuthed={isAuthed}
                onAddToQueue={handleAddToQueue}
                ytm={ytm}
                ytmLoading={ytmLoading}
                history={history}
                histLoading={histLoading}
              />
            }
          />
          <Route
            path="/search"
            element={
              <HomePanel
                isAuthed={isAuthed}
                onAddToQueue={handleAddToQueue}
                ytm={ytm}
                ytmLoading={ytmLoading}
                history={history}
                histLoading={histLoading}
              />
            }
          />
          <Route path="/album/:id" element={<AlbumPanel onAddToQueue={handleAddToQueue} queueOpen={queueOpen} />} />
          <Route path="/artist/:id" element={<ArtistPanel onAddToQueue={handleAddToQueue} />} />
          <Route path="/container/:id" element={<ContainerPanel onAddToQueue={handleAddToQueue} />} />
          <Route path="/leaderboard" element={<LeaderboardPanel />} />
          <Route path="/queuedle" element={<QueuedlePanel />} />
          <Route path="/lyrics" element={<LyricsPanel playback={playback} />} />
        </Routes>
      </div>
      <QueueSidebar
        open={queueOpen}
        items={queueItems}
        setItems={setQueueItems}
        isLoading={queueLoading}
        error={queueError}
        currentObjectId={playback.currentObjectId}
        currentQueueItemId={playback.queueItemId}
        onClose={() => setQueueOpen(false)}
        onRefresh={reloadQueue}
        onError={showToast}
        onAddToQueue={handleAddToQueue}
        onRestore={handleRestore}
        onRestoreResult={showToast}
      />
      <PlayerBar
        isAuthed={isAuthed}
        playback={playback}
        onToggleQueue={() => setQueueOpen((o) => !o)}
        onShuffle={reloadQueue}
      />
      {toastMsg && <div className={styles.toast}>{toastMsg}</div>}
      {displayName === null && (
        <DisplayNameModal
          onSave={(name) => {
            window.sonos.setDisplayName(name).catch(() => {
              /* silent */
            });
            setDisplayName(name);
          }}
        />
      )}
      {feedbackOpen && <FeedbackDialog onClose={() => setFeedbackOpen(false)} />}
      {changelogOpen && <ChangelogDialog onClose={() => setChangelogOpen(false)} />}
    </div>
  );
}

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
