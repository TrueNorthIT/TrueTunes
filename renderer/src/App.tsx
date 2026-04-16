import { useCallback, useEffect, useRef, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
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

  const [queueOpen, setQueueOpen]     = useState(false);
  const [toastMsg, setToastMsg]       = useState<string | null>(null);
  const toastTimer                    = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const handleAddToQueue = useCallback(async (item: SonosItem, position = -1) => {
    if (isProgram(item)) {
      const rid = item.resource?.id as SonosItemId | undefined;
      const iid = typeof item.id === 'object' ? item.id as SonosItemId : undefined;
      const r = await window.sonos.loadContent({
        type: item.resource?.type ?? item.type ?? 'PROGRAM',
        id: {
          objectId:  rid?.objectId  ?? iid?.objectId,
          accountId: rid?.accountId ?? iid?.accountId,
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

    const normalized = normalizeForQueue(item);
    const isSingleTrack = isTrack(item);

    if (isSingleTrack) {
      setQueueItems(prev => {
        if (position === -1 || position >= prev.length) return [...prev, normalized];
        const next = [...prev];
        next.splice(position, 0, normalized);
        return next;
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
      reloadQueue();
      setTimeout(reloadQueue, 1500);
    }
  }, [queryClient, setQueueItems, reloadQueue, queueIdRef, queueVersionRef, showToast]);

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
        onGroupChange={handleGroupChange}
        queueOpen={queueOpen}
        onToggleQueue={() => setQueueOpen(o => !o)}
        onResync={() => window.sonos.resync()}
      />
      <div className={`${styles.body}${queueOpen ? ' ' + styles.bodyQueueOpen : ''}`}>
        <Routes>
          <Route path="/"          element={<HomePanel isAuthed={isAuthed} onAddToQueue={handleAddToQueue} />} />
          <Route path="/search"    element={<HomePanel isAuthed={isAuthed} onAddToQueue={handleAddToQueue} />} />
          <Route path="/album/:id" element={<AlbumPanel onAddToQueue={handleAddToQueue} />} />
          <Route path="/artist/:id" element={<ArtistPanel onAddToQueue={handleAddToQueue} />} />
          <Route path="/container/:id" element={<ContainerPanel onAddToQueue={handleAddToQueue} />} />
        </Routes>
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
        onAddToQueue={handleAddToQueue}
      />
      <PlayerBar
        isAuthed={isAuthed}
        playback={playback}
        onToggleQueue={() => setQueueOpen(o => !o)}
        onShuffle={reloadQueue}
      />
      {toastMsg && <div className={styles.toast}>{toastMsg}</div>}
    </div>
  );
}
