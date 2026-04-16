import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './hooks/useAuth';
import { useGroups } from './hooks/useGroups';
import { usePlayback } from './hooks/usePlayback';
import { useQueue } from './hooks/useQueue';
import { trackQueryOptions } from './hooks/useTrackDetails';
import { api } from './lib/sonosApi';
import { normalizeForQueue, isTrack, isProgram } from './lib/itemHelpers';
import type { SonosItem, SonosItemId } from './types/sonos';

import { TopNav } from './components/TopNav';
import { PlayerBar } from './components/PlayerBar';
import { HomePanel } from './components/HomePanel';
import { AlbumPanel } from './components/AlbumPanel';
import { ArtistPanel } from './components/ArtistPanel';
import { ContainerPanel } from './components/ContainerPanel';
import { QueueSidebar } from './components/QueueSidebar';

import styles from './styles/App.module.css';

export function App() {
  const queryClient                               = useQueryClient();
  const isAuthed                                  = useAuth();
  const groups                                    = useGroups();
  const [activeGroupId, setActiveGroupId]         = useState<string | null>(null);
  const { playback, applyGroupCache, queueIdRef, queueVersionRef } = usePlayback(activeGroupId);
  const { items: queueItems, setItems: setQueueItems, isLoading: queueLoading, error: queueError, reload: reloadQueue }
                                                  = useQueue(isAuthed, activeGroupId, playback.queueId,
                                                      (etag) => { queueVersionRef.current = etag; });

  const [view, setView]               = useState<'home' | 'search'>('home');
  const [activeSearch, setActiveSearch] = useState('');
  const [activeAlbum, setActiveAlbum]         = useState<SonosItem | null>(null);
  const [activeArtist, setActiveArtist]       = useState<SonosItem | null>(null);
  const [activeContainer, setActiveContainer] = useState<SonosItem | null>(null);
  const [queueOpen, setQueueOpen]     = useState(false);
  const [toastMsg, setToastMsg]       = useState<string | null>(null);
  const toastTimer                    = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Set the first group once WS bootstrap sends groups
  useEffect(() => {
    if (groups.length > 0 && !activeGroupId) {
      setActiveGroupId(groups[0].id);
    }
  }, [groups, activeGroupId]);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 4000);
  }, []);

  const handleGroupChange = useCallback((groupId: string) => {
    setActiveGroupId(groupId);
    window.sonos.setGroup(groupId);
    applyGroupCache(groupId);
  }, [applyGroupCache]);

  const handleSearch = useCallback((q: string) => {
    setView('search');
    setActiveSearch(q);
  }, []);

  const handleClearSearch = useCallback(() => {
    setView('home');
    setActiveSearch('');
    setActiveAlbum(null);
    setActiveArtist(null);
    setActiveContainer(null);
  }, []);

  const handleAddToQueue = useCallback(async (item: SonosItem, position = -1) => {
    // Programs (radio stations, mixes) are loaded via WS loadContent, not HTTP queue add
    if (isProgram(item)) {
      const rid = item.resource?.id as SonosItemId | undefined;
      const iid = typeof item.id === 'object' ? item.id as SonosItemId : undefined;
      const r = await window.sonos.loadContent({
        type: item.resource?.type ?? item.type ?? 'PROGRAM',
        id: {
          objectId:  rid?.objectId  ?? iid?.objectId,
          accountId: rid?.accountId ?? iid?.accountId, // keep sn_ prefix for WS
          serviceId: rid?.serviceId ?? iid?.serviceId,
        },
        playbackAction: 'PLAY',
        playModes: { shuffle: false },
        defaults: item.resource?.defaults ?? undefined,
        queueAction: 'REPLACE',
      }) as { error?: string } | null;
      if (r && 'error' in r && r.error) showToast('Play failed: ' + r.error);
      else reloadQueue();
      return;
    }

    // Normalise raw browse items so useQueueTrack can extract IDs for nowPlaying
    const normalized = normalizeForQueue(item);
    const isSingleTrack = isTrack(item);

    if (isSingleTrack) {
      // Optimistic insert — show the track immediately in the sidebar
      setQueueItems(prev => {
        if (position === -1 || position >= prev.length) return [...prev, normalized];
        const next = [...prev];
        next.splice(position, 0, normalized);
        return next;
      });

      // Kick off the nowPlaying query so art/artist populate without waiting for re-render
      const tid = normalized.track?.id as SonosItemId | undefined;
      if (tid?.objectId && tid?.serviceId && tid?.accountId) {
        queryClient.prefetchQuery(trackQueryOptions(tid.objectId, tid.serviceId, tid.accountId));
      }
    }

    const rid = normalized.resource?.id;
    const iid = typeof normalized.id === 'object' ? normalized.id : undefined;
    const body = {
      id: {
        objectId:  rid?.objectId  ?? iid?.objectId,
        serviceId: rid?.serviceId ?? iid?.serviceId,
        accountId: (rid?.accountId ?? iid?.accountId)?.replace(/^sn_/, ''),
      },
      type: (normalized.type ?? normalized.resource?.type ?? 'TRACK').replace(/^ITEM_/, ''),
    };
    const r = await api.queue.add(body, {
      queueId: queueIdRef.current ?? undefined,
      ifMatch: queueVersionRef.current ?? undefined,
      position,
    });
    if (r.error) { showToast('Add failed: ' + r.error); reloadQueue(); return; }
    if (r.etag) queueVersionRef.current = r.etag;

    if (!isSingleTrack) {
      // Albums/playlists are expanded into tracks server-side — reload to get the real tracks.
      // Two reloads: one immediately (clears any stale state) and one after a short delay
      // to catch cases where Sonos hasn't finished expanding yet.
      reloadQueue();
      setTimeout(reloadQueue, 1500);
    }
  }, [queryClient, setQueueItems, reloadQueue, queueIdRef, queueVersionRef]);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key === 'H') window.sonos.openHttpMonitor();
      if (e.ctrlKey && e.shiftKey && e.key === 'W') window.sonos.openWsMonitor();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={styles.shell}>
      <TopNav
        isAuthed={isAuthed}
        groups={groups}
        activeGroupId={activeGroupId}
        view={view}
        onGroupChange={handleGroupChange}
        onSearch={handleSearch}
        onClearSearch={handleClearSearch}
        queueOpen={queueOpen}
        onToggleQueue={() => setQueueOpen(o => !o)}
        onBack={
          activeArtist ? () => setActiveArtist(null)
          : activeAlbum ? () => setActiveAlbum(null)
          : activeContainer ? () => setActiveContainer(null)
          : undefined
        }
        onResync={() => window.sonos.resync()}
      />
      <div className={`${styles.body}${queueOpen ? ' ' + styles.bodyQueueOpen : ''}`}>
        {activeArtist ? (
          <ArtistPanel
            item={activeArtist}
            onOpenAlbum={(album) => { setActiveArtist(null); setActiveAlbum(album); }}
            onAddToQueue={handleAddToQueue}
          />
        ) : activeAlbum ? (
          <AlbumPanel
            item={activeAlbum}
            onAddToQueue={handleAddToQueue}
            onOpenArtist={setActiveArtist}
          />
        ) : activeContainer ? (
          <ContainerPanel
            item={activeContainer}
            onAddToQueue={handleAddToQueue}
            onOpenAlbum={setActiveAlbum}
            onOpenArtist={setActiveArtist}
            onOpenContainer={setActiveContainer}
          />
        ) : (
          <HomePanel
            isAuthed={isAuthed}
            view={view}
            activeSearch={activeSearch}
            onAddToQueue={handleAddToQueue}
            onOpenAlbum={setActiveAlbum}
            onOpenArtist={setActiveArtist}
            onOpenContainer={setActiveContainer}
          />
        )}
      </div>
      <QueueSidebar
        open={queueOpen}
        items={queueItems}
        setItems={setQueueItems}
        isLoading={queueLoading}
        error={queueError}
        currentObjectId={playback.currentObjectId}
        onClose={() => setQueueOpen(false)}
        onRefresh={reloadQueue}
        onOpenAlbum={setActiveAlbum}
        onAddToQueue={handleAddToQueue}
      />
      <PlayerBar
        isAuthed={isAuthed}
        playback={playback}
        onOpenAlbum={setActiveAlbum}
        onToggleQueue={() => setQueueOpen(o => !o)}
        onShuffle={reloadQueue}
      />
      {toastMsg && <div className={styles.toast}>{toastMsg}</div>}
    </div>
  );
}
