import { Suspense, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, Search, X } from 'lucide-react';
import type { usePlayback } from '../../hooks/usePlayback';
import { useNowPlaying } from '../../hooks/useNowPlaying';
import { useDisplayName } from '../../hooks/useDisplayName';
import { usePolls } from '../../hooks/usePolls';
import { useSearchBox } from '../../hooks/useSearchBox';
import type { NormalizedGroup, NormalizedQueueItem } from '../../types/provider';
import { AmbientBackdrop } from '../AmbientBackdrop';
import { RouteBoundary } from '../ErrorBoundary';
import { useToast } from '../common/Toast';
import { QueueSidebar } from '../queue/QueueSidebar';
import { SearchPanel } from '../search/SearchPanel';
import { MorePage } from './MorePage';
import { NowPlayingPage } from './NowPlayingPage';
import { PhoneMiniPlayer } from './PhoneMiniPlayer';
import { TabBar, tabOf, type PhoneTab } from './TabBar';
import styles from '../../styles/PhoneShell.module.css';

interface Props {
  isAuthed: boolean;
  playback: ReturnType<typeof usePlayback>['playback'];
  queueItems: NormalizedQueueItem[];
  queueLoading: boolean;
  queueReadOnly: boolean;
  queueError: string | null;
  reloadQueue: () => void;
  groups: NormalizedGroup[];
  activeGroupId: string | null;
  onGroupChange: (groupId: string) => void;
  onFeedback: () => void;
  /** Same DJ section as the docked queue: it's the same queue underneath. */
  autoplay?: {
    enabled: boolean;
    upcoming: DjTrack[];
    fillerUri: string | null;
    setEnabled: (on: boolean) => void;
  };
  /** The routed pages the desktop shell shows, as <Route> elements: the phone shows the same ones. */
  pages: ReactNode;
}

/** The Search tab's field. The nav pill's search box on the desktop; here it heads the page. */
function SearchField({ disabled }: { disabled: boolean }) {
  const { searchText, setSearchText, onKeyDown } = useSearchBox();
  return (
    <div className={styles.searchBar} role="search">
      <Search size={18} className={styles.searchIcon} aria-hidden="true" />
      {/* No autoFocus: opening the tab must not pop the keyboard. The recent searches show until it is tapped. */}
      <input
        className={styles.searchInput}
        type="text"
        inputMode="search"
        enterKeyHint="search"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="Songs, artists, albums"
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        onKeyDown={(e) => {
          // Esc leaves search on the desktop; here Search is a tab, so it only puts the keyboard away.
          if (e.key !== 'Escape') onKeyDown(e);
          if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
        }}
        aria-label="Search songs, artists and albums"
        data-search-input=""
        disabled={disabled}
      />
      {searchText && (
        <button type="button" className={styles.searchClear} aria-label="Clear search" onClick={() => setSearchText('')}>
          <X size={18} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/**
 * The web app's shell on a phone (a window too narrow for the full layout): the same routed pages as the
 * desktop, a mini player and a tab bar docked at the bottom, and three routes of its own: /queue, /now-playing
 * and /more. The structure and the reasons are in docs/pwa/PROGRESS.md and DESIGN.md ("Phone shell").
 */
export function PhoneShell({
  isAuthed,
  playback,
  queueItems,
  queueLoading,
  queueReadOnly,
  queueError,
  reloadQueue,
  groups,
  activeGroupId,
  onGroupChange,
  onFeedback,
  autoplay,
  pages,
}: Props) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const np = useNowPlaying(playback);
  const displayName = useDisplayName();
  const { showToast } = useToast();
  const polls = usePolls();
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  useEffect(() => window.sonos.onUpdateDownloaded(setUpdateVersion), []);

  // The document says which shell is showing: global.css retunes the gutter and the page clearances, and the
  // context menu becomes a sheet. Set before paint, so no page is ever laid out with the desktop's numbers.
  useLayoutEffect(() => {
    document.documentElement.dataset.shell = 'phone';
    return () => {
      delete document.documentElement.dataset.shell;
    };
  }, []);

  // A page that belongs to no tab (an album, an artist, the lyrics) keeps the tab it was reached from lit.
  const here = tabOf(pathname);
  const [lastTab, setLastTab] = useState<PhoneTab>(here ?? '/');
  if (here && here !== lastTab) setLastTab(here);

  const playerOpen = pathname === '/now-playing';
  const isTabRoot = here !== null && pathname === here;
  const canGoBack = ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;
  const showBack = !isTabRoot && !playerOpen;
  const moreWaiting = polls.current ? 'a poll is waiting' : updateVersion ? 'an update is ready' : null;

  return (
    <div className={styles.shell}>
      <AmbientBackdrop nowPlayingArt={playback.artUrl} />
      <div className={styles.statusBar} aria-hidden="true" />
      <div className={styles.page} data-back={showBack ? '' : undefined}>
        {showBack && (
          <button
            type="button"
            className={styles.back}
            aria-label="Back"
            onClick={() => void (canGoBack ? navigate(-1) : navigate(lastTab, { replace: true }))}
          >
            <ChevronLeft size={22} aria-hidden="true" />
          </button>
        )}
        <main className={styles.routes} key={pathname}>
          <RouteBoundary>
            <Suspense fallback={null}>
              <Routes>
                {/* The phone's own routes first: its Search page wins over the desktop's bare panel. */}
                <Route
                  path="/search"
                  element={
                    <div className={styles.searchPage}>
                      <SearchField disabled={!isAuthed} />
                      <SearchPanel />
                    </div>
                  }
                />
                <Route
                  path="/queue"
                  element={
                    <div className={`page-scale ${styles.queuePage}`}>
                      <QueueSidebar
                        variant="page"
                        autoplay={autoplay}
                        viewer={displayName}
                        items={queueItems}
                        groupId={activeGroupId}
                        isLoading={queueLoading}
                        readOnly={queueReadOnly}
                        error={queueError}
                        currentObjectId={playback.currentObjectId}
                        currentQueueItemId={playback.queueItemId}
                        isPlaying={playback.isPlaying}
                        currentTrackDurationMs={playback.durationMs}
                        groupName={groups.find((g) => g.id === activeGroupId)?.name ?? null}
                        onRefresh={reloadQueue}
                        onError={showToast}
                      />
                    </div>
                  }
                />
                <Route
                  path="/now-playing"
                  element={<NowPlayingPage isAuthed={isAuthed} playback={playback} np={np} onShuffle={reloadQueue} />}
                />
                <Route
                  path="/more"
                  element={
                    <MorePage
                      isAuthed={isAuthed}
                      groups={groups}
                      activeGroupId={activeGroupId}
                      onGroupChange={onGroupChange}
                      onResync={() => void window.sonos.resync()}
                      onFeedback={onFeedback}
                      updateVersion={updateVersion}
                      polls={polls}
                    />
                  }
                />
                {pages}
              </Routes>
            </Suspense>
          </RouteBoundary>
        </main>
      </div>
      {!playerOpen && (
        <div className={styles.dock}>
          <PhoneMiniPlayer np={np} isAuthed={isAuthed} />
          <TabBar active={lastTab} moreWaiting={moreWaiting} />
        </div>
      )}
    </div>
  );
}
