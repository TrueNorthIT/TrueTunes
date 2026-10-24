import { lazy, memo, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { getActiveProvider } from './providers';
import { useAuth } from './hooks/useAuth';
import { useGroups } from './hooks/useGroups';
import { usePlayback } from './hooks/usePlayback';
import { useMediaSession } from './hooks/useMediaSession';
import { useQueue } from './hooks/useQueue';
import { QueueActionsProvider, useCreateQueueActions } from './hooks/useQueueActions';
import { useEnsureFavourites } from './hooks/usePlaylists';
import type { SonosItem } from './types/sonos';

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
import { QueueSidebar, type QueueSidebarHandle } from './components/queue/QueueSidebar';
import { SkinnyShell } from './components/skinny/SkinnyShell';
import { useSkinnyMode } from './hooks/useSkinnyMode';
import { MiniPlayerShell } from './components/MiniPlayer';
import { FeedbackDialog } from './components/FeedbackDialog';
import { PollAdminLauncher } from './components/polls/PollAdminLauncher';
import { ChangelogDialog } from './components/ChangelogDialog';
import { useDisplayName, useDisplayNameActions, refreshDisplayName } from './hooks/useDisplayName';
import { ProfilePanel } from './components/ProfilePanel';
import { PlaylistPanel } from './components/PlaylistPanel';
import { ContextMenuProvider } from './components/common/ContextMenu';
import { ToastProvider, useToast } from './components/common/Toast';
import { usePrefetchNextLyrics } from './hooks/usePrefetchNextLyrics';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Splash } from './components/Splash';
import { effectiveDockedWidth } from './lib/queueWidth';

import styles from './styles/App.module.css';

// The heavy routes load on first visit, so they don't weigh on startup.
const LeaderboardPanel = lazy(() =>
  import('./components/LeaderboardPanel').then((m) => ({ default: m.LeaderboardPanel }))
);
const QueuedlePanel = lazy(() =>
  import('./components/queuedle/QueuedlePanel').then((m) => ({ default: m.QueuedlePanel }))
);
const QueuedleStatsPanel = lazy(() =>
  import('./components/queuedle/QueuedleStatsPanel').then((m) => ({ default: m.QueuedleStatsPanel }))
);
const MusicStatsPanel = lazy(() =>
  import('./components/musicStats/MusicStatsPanel').then((m) => ({ default: m.MusicStatsPanel }))
);
const LyricsPanel = lazy(() => import('./components/LyricsPanel').then((m) => ({ default: m.LyricsPanel })));

// ── Mini player window: self-contained shell ──────────────────────────────────

// ── Main app ──────────────────────────────────────────────────────────────────

const MainApp = memo(function MainApp() {
  const queryClient = useQueryClient();
  const isAuthed = useAuth();
  const groups = useGroups();
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const { showToast } = useToast();
  const { playback, applyGroupCache, queueIdRef, queueVersionRef } = usePlayback(activeGroupId);
  useMediaSession(playback);
  // useQueue refetches on a new queueVersion (external adds/removes/reorders); the attribution
  // badges refresh alongside it.
  const {
    items: queueItems,
    isLoading: queueLoading,
    isPlaceholder: queuePlaceholder,
    error: queueError,
    reload: reloadQueueRaw,
  } = useQueue(
    isAuthed,
    activeGroupId,
    playback.queueId,
    (etag) => {
      queueVersionRef.current = etag;
    },
    (msg) => showToast(`Queue refresh failed: ${msg}`),
    playback.queueVersion
  );
  usePrefetchNextLyrics(queueItems, playback.queueItemId);

  const reloadQueue = useCallback(() => {
    void reloadQueueRaw();
    window.sonos.refreshAttribution().catch(() => {});
  }, [reloadQueueRaw]);

  useEffect(() => {
    if (playback.queueVersion) window.sonos.refreshAttribution().catch(() => {});
  }, [playback.queueVersion]);

  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const displayName = useDisplayName(); // undefined = not yet loaded
  const displayNameActions = useDisplayNameActions();
  useEnsureFavourites(displayName);
  // The saved width is the user's preference; the state is what this window can give it
  // (effectiveDockedWidth), re-derived on every resize and never written back as the preference.
  const queueWidthPrefRef = useRef(380);
  const [queueDockedWidth, setQueueDockedWidth] = useState<number>(() => effectiveDockedWidth(380, window.innerWidth));
  const fitQueueWidth = useCallback(() => {
    setQueueDockedWidth(effectiveDockedWidth(queueWidthPrefRef.current, window.innerWidth));
  }, []);
  const queueSidebarRef = useRef<QueueSidebarHandle>(null);
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
      await queueActions.addToQueue(
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

  const queueActions = useCreateQueueActions({
    queueItems,
    groupId: activeGroupId,
    reloadQueue,
    reloadQueueRaw,
    queueIdRef,
    queueVersionRef,
    fillerUri: autoplay.fillerUri,
    queueItemId: playback.queueItemId,
  });

  const handleGroupChange = useCallback(
    (groupId: string) => {
      setActiveGroupId(groupId);
      void getActiveProvider().setGroup(groupId);
      applyGroupCache(groupId);
      window.sonos.refreshAttribution().catch(() => {});
      window.sonos.trackEvent('group_changed').catch(() => {});
    },
    [applyGroupCache]
  );

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key === 'H') void window.sonos.openHttpMonitor();
      if (e.ctrlKey && e.shiftKey && e.key === 'W') void window.sonos.openWsMonitor();
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

  return (
    <QueueActionsProvider value={queueActions}>
      <ContextMenuProvider>
        <Splash ready={splashReady} />
        {skinny ? (
          <SkinnyShell
            autoplay={autoplay}
            isAuthed={isAuthed}
            playback={playback}
            queueItems={queueItems}
            queueLoading={queueLoading}
            queueReadOnly={queuePlaceholder}
            queueError={queueError}
            reloadQueue={reloadQueue}
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
              onResync={() => void window.sonos.resync()}
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
                <RouteBoundary>
                  <Suspense fallback={null}>
                    <Routes>
                      <Route
                        path="/"
                        element={
                          <HomePanel
                            isAuthed={isAuthed}
                            ytm={ytm}
                            ytmLoading={ytmLoading}
                            playback={playback}
                            queueItems={queueItems}
                          />
                        }
                      />
                      <Route path="/search" element={<SearchPanel />} />
                      <Route path="/discover" element={<DiscoverPanel queueItems={queueItems} />} />
                      <Route path="/album/:id" element={<AlbumPanel playback={playback} />} />
                      <Route
                        path="/artist/:id"
                        element={
                          <ArtistPanel currentTrackName={playback.trackName} isPlaybackActive={playback.isPlaying} />
                        }
                      />
                      <Route path="/container/:id" element={<ContainerPanel />} />
                      <Route path="/leaderboard" element={<LeaderboardPanel />} />
                      <Route path="/leaderboard/stats" element={<MusicStatsPanel />} />
                      <Route path="/queuedle" element={<QueuedlePanel />} />
                      <Route path="/queuedle/stats" element={<QueuedleStatsPanel />} />
                      <Route path="/lyrics" element={<LyricsPanel playback={playback} />} />
                      <Route path="/profile/:userName" element={<ProfilePanel />} />
                      <Route path="/playlist/:id" element={<PlaylistPanel />} />
                    </Routes>
                  </Suspense>
                </RouteBoundary>
              </main>
              <QueueSidebar
                ref={queueSidebarRef}
                viewer={displayName}
                items={queueItems}
                groupId={activeGroupId}
                isLoading={queueLoading}
                readOnly={queuePlaceholder}
                error={queueError}
                currentObjectId={playback.currentObjectId}
                currentQueueItemId={playback.queueItemId}
                isPlaying={playback.isPlaying}
                currentTrackDurationMs={playback.durationMs}
                groupName={groups.find((g) => g.id === activeGroupId)?.name ?? null}
                onRefresh={reloadQueue}
                onError={showToast}
                dockedWidth={queueDockedWidth}
                onResizeWidth={handleSetQueueDockedWidth}
                onResizeWidthLive={handleResizeWidthLive}
                autoplay={autoplay}
              />
            </div>
            <PlayerBar isAuthed={isAuthed} playback={playback} onShuffle={reloadQueue} />
          </div>
        )}
        {feedbackOpen && <FeedbackDialog onClose={() => setFeedbackOpen(false)} />}
        <PollAdminLauncher />
        {changelogOpen && <ChangelogDialog onClose={() => setChangelogOpen(false)} />}
      </ContextMenuProvider>
    </QueueActionsProvider>
  );
});

/** A crash in one page leaves the shell (queue, player, nav) alive; navigating resets it. */
function RouteBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <ErrorBoundary key={pathname}>{children}</ErrorBoundary>;
}

// ── Root ──────────────────────────────────────────────────────────────────────

export function App() {
  const location = useLocation();
  return location.pathname === '/mini' ? (
    <MiniPlayerShell />
  ) : (
    <ErrorBoundary>
      <ToastProvider>
        <MainApp />
      </ToastProvider>
    </ErrorBoundary>
  );
}
