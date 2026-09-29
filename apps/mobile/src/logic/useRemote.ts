// The core of desktop's MainApp (renderer/src/App.tsx) as a platform-neutral hook: auth, groups,
// active-group selection, playback, queue and the reload triggers. The remaining MainApp pieces
// (add-to-queue + attribution, autoplay, layout) live in their own modules / the UI layer.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from './context/ToastContext';
import { useAuth } from './hooks/useAuth';
import { useGroups } from './hooks/useGroups';
import { usePlayback } from './hooks/usePlayback';
import { usePrefetchNextLyrics } from './hooks/usePrefetchNextLyrics';
import { useQueue } from './hooks/useQueue';
import { useEnsureFavourites } from './hooks/usePlaylists';
import { getActiveProvider } from './providers';

export function useRemote() {
  const { showToast } = useToast();
  const isAuthed = useAuth();
  const groups = useGroups();
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  const { playback, applyGroupCache, queueIdRef, queueVersionRef } = usePlayback(activeGroupId);
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
    (msg) => showToast(`Queue refresh failed: ${msg}`, 'error')
  );
  usePrefetchNextLyrics(queueItems, playback.queueItemId);

  const reloadQueue = useCallback(() => {
    reloadQueueRaw();
    window.sonos.refreshAttribution().catch(() => {});
  }, [reloadQueueRaw]);

  // Reload whenever Sonos reports a new queue version - catches external adds/removes/reorders.
  const seenQueueVersionRef = useRef<string | null>(null);
  useEffect(() => {
    const v = playback.queueVersion;
    if (!v || v === seenQueueVersionRef.current) return;
    seenQueueVersionRef.current = v;
    reloadQueue();
  }, [playback.queueVersion, reloadQueue]);

  // Reload as soon as the WS session is up - the first queue load can fire before it is established.
  useEffect(() => window.sonos.onWsReady(() => reloadQueue()), [reloadQueue]);

  const [displayName, setDisplayName] = useState<string | null | undefined>(undefined); // undefined = not yet loaded
  useEnsureFavourites(displayName);
  useEffect(() => {
    window.sonos
      .getDisplayName()
      .then(setDisplayName)
      .catch(() => setDisplayName(null));
    return window.sonos.onEntraReady(() => {
      window.sonos
        .getDisplayName()
        .then(setDisplayName)
        .catch(() => {});
    });
  }, []);

  // Pick the saved group (matched by stable coordinatorId), else the first.
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

  const changeGroup = useCallback(
    (groupId: string) => {
      setActiveGroupId(groupId);
      getActiveProvider().setGroup(groupId);
      applyGroupCache(groupId);
      window.sonos.refreshAttribution().catch(() => {});
      window.sonos.trackEvent('group_changed').catch(() => {});
    },
    [applyGroupCache]
  );

  /** Desktop does this on window focus; mobile calls it when the app returns to the foreground. */
  const refreshPlayback = useCallback(() => {
    window.sonos.refreshPlayback().catch(() => {});
  }, []);

  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? null;

  return {
    isAuthed,
    groups,
    activeGroupId,
    activeGroup,
    changeGroup,
    playback,
    queue: {
      items: queueItems,
      setItems: setQueueItems,
      isLoading: queueLoading,
      error: queueError,
      reload: reloadQueue,
      reloadRaw: reloadQueueRaw,
    },
    queueIdRef,
    queueVersionRef,
    displayName,
    setDisplayName,
    refreshPlayback,
  };
}

export type Remote = ReturnType<typeof useRemote>;
