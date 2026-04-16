import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { useGroups } from './hooks/useGroups';
import { usePlayback } from './hooks/usePlayback';
import { useQueue } from './hooks/useQueue';
import { api } from './lib/sonosApi';
import type { SonosItem } from './types/sonos';

import { TopNav } from './components/TopNav';
import { PlayerBar } from './components/PlayerBar';
import { HomePanel } from './components/HomePanel';
import { AlbumPanel } from './components/AlbumPanel';
import { ArtistPanel } from './components/ArtistPanel';
import { QueueSidebar, type QueueSidebarHandle } from './components/QueueSidebar';

import styles from './styles/App.module.css';

export function App() {
  const isAuthed                                  = useAuth();
  const groups                                    = useGroups();
  const [activeGroupId, setActiveGroupId]         = useState<string | null>(null);
  const { playback, applyGroupCache, queueIdRef, queueVersionRef } = usePlayback(activeGroupId);
  const { items: queueItems, isLoading: queueLoading, error: queueError, reload: reloadQueue }
                                                  = useQueue(isAuthed, activeGroupId, playback.queueId);

  const [view, setView]               = useState<'home' | 'search'>('home');
  const [activeSearch, setActiveSearch] = useState('');
  const [activeAlbum, setActiveAlbum]   = useState<SonosItem | null>(null);
  const [activeArtist, setActiveArtist] = useState<SonosItem | null>(null);
  const [queueOpen, setQueueOpen]     = useState(false);

  const queueRef = useRef<QueueSidebarHandle>(null);

  // Set the first group once WS bootstrap sends groups
  useEffect(() => {
    if (groups.length > 0 && !activeGroupId) {
      setActiveGroupId(groups[0].id);
    }
  }, [groups, activeGroupId]);

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
  }, []);

  const handleAddToQueue = useCallback(async (item: SonosItem, position = -1) => {
    const rid = item.resource?.id;
    const iid = typeof item.id === 'object' ? item.id : undefined;
    const body = {
      id: {
        objectId:  rid?.objectId  ?? iid?.objectId,
        serviceId: rid?.serviceId ?? iid?.serviceId,
        accountId: (rid?.accountId ?? iid?.accountId)?.replace(/^sn_/, ''),
      },
      type: (item.type ?? item.resource?.type ?? 'TRACK').replace(/^ITEM_/, ''),
    };
    const r = await api.queue.add(body, {
      queueId: queueIdRef.current ?? undefined,
      ifMatch: queueVersionRef.current ?? undefined,
      position,
    });
    if (r.error) { alert('Add failed: ' + r.error); return; }
    if (r.etag) queueVersionRef.current = r.etag;
    reloadQueue();
  }, [reloadQueue, queueIdRef, queueVersionRef]);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key === 'H') window.sonos.openHttpMonitor();
      if (e.ctrlKey && e.shiftKey && e.key === 'W') window.sonos.openWsMonitor();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const handleJumpToPlaying = useCallback(() => {
    setQueueOpen(true);
    setTimeout(() => queueRef.current?.scrollToPlaying(), 60);
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
          : undefined
        }
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
        ) : (
          <HomePanel
            isAuthed={isAuthed}
            view={view}
            activeSearch={activeSearch}
            onAddToQueue={handleAddToQueue}
            onOpenAlbum={setActiveAlbum}
            onOpenArtist={setActiveArtist}
          />
        )}
      </div>
      <QueueSidebar
        ref={queueRef}
        open={queueOpen}
        items={queueItems}
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
        onJumpToPlaying={handleJumpToPlaying}
        onOpenAlbum={setActiveAlbum}
        onToggleQueue={() => setQueueOpen(o => !o)}
        onShuffle={reloadQueue}
      />
    </div>
  );
}
