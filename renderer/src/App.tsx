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
import { QueueSidebar, type QueueSidebarHandle } from './components/QueueSidebar';

import styles from './styles/App.module.css';

export function App() {
  const isAuthed                                  = useAuth();
  const groups                                    = useGroups();
  const [activeGroupId, setActiveGroupId]         = useState<string | null>(null);
  const { playback, applyGroupCache }             = usePlayback(activeGroupId);
  const { items: queueItems, isLoading: queueLoading, error: queueError, reload: reloadQueue }
                                                  = useQueue(isAuthed, activeGroupId);

  const [view, setView]               = useState<'home' | 'search'>('home');
  const [activeSearch, setActiveSearch] = useState('');
  const [activeAlbum, setActiveAlbum] = useState<SonosItem | null>(null);
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
  }, []);

  const handleAddToQueue = useCallback(async (item: SonosItem) => {
    const body = {
      id: item.id ?? {
        objectId:  item.objectId  ?? (item.resource?.id as { objectId?: string }  | undefined)?.objectId,
        serviceId: item.serviceId ?? (item.resource?.id as { serviceId?: string } | undefined)?.serviceId,
        accountId: item.accountId ?? (item.resource?.id as { accountId?: string } | undefined)?.accountId,
      },
      type: item.type ?? item.resource?.type ?? 'TRACK',
    };
    const r = await api.queue.add(body);
    if (r.error) { alert('Add failed: ' + r.error); return; }
    reloadQueue();
  }, [reloadQueue]);

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
      />
      <div className={`${styles.body}${queueOpen ? ' ' + styles.bodyQueueOpen : ''}`}>
        {activeAlbum ? (
          <AlbumPanel
            item={activeAlbum}
            onBack={() => setActiveAlbum(null)}
            onAddToQueue={handleAddToQueue}
          />
        ) : (
          <HomePanel
            isAuthed={isAuthed}
            view={view}
            activeSearch={activeSearch}
            onAddToQueue={handleAddToQueue}
            onOpenAlbum={setActiveAlbum}
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
      />
      <PlayerBar
        isAuthed={isAuthed}
        playback={playback}
        onJumpToPlaying={handleJumpToPlaying}
        onOpenAlbum={setActiveAlbum}
        onToggleQueue={() => setQueueOpen(o => !o)}
      />
    </div>
  );
}
