import type { usePlayback } from '../../hooks/usePlayback';
import { useNowPlaying } from '../../hooks/useNowPlaying';
import type { NormalizedQueueItem, NormalizedGroup } from '../../types/provider';
import { QueueSidebar } from '../queue/QueueSidebar';
import { SkinnyTransport } from './SkinnyTransport';
import { AmbientBackdrop } from '../AmbientBackdrop';
import styles from '../../styles/SkinnyShell.module.css';

interface Props {
  isAuthed: boolean;
  playback: ReturnType<typeof usePlayback>['playback'];
  queueItems: NormalizedQueueItem[];
  setQueueItems: (updater: NormalizedQueueItem[] | ((prev: NormalizedQueueItem[]) => NormalizedQueueItem[])) => void;
  queueLoading: boolean;
  queueError: string | null;
  reloadQueue: () => void;
  showToast: (msg: string) => void;
  groups: NormalizedGroup[];
  activeGroupId: string | null;
  /** Same DJ section as the docked queue — it's the same queue underneath. */
  autoplay?: {
    enabled: boolean;
    upcoming: DjTrack[];
    fillerUri: string | null;
    setEnabled: (on: boolean) => void;
  };
}

/**
 * Skinny side-panel layout: the queue (full width) over a docked Now playing card. No nav, no
 * search, no browse panels. Shown automatically when the window is narrower than FULL_MIN.
 * The room's colour comes from the same blurred artwork as the full layout, not a local glow.
 */
export function SkinnyShell({
  autoplay,
  isAuthed,
  playback,
  queueItems,
  setQueueItems,
  queueLoading,
  queueError,
  reloadQueue,
  showToast,
  groups,
  activeGroupId,
}: Props) {
  const np = useNowPlaying(playback);

  return (
    <div className={styles.shell}>
      <AmbientBackdrop nowPlayingArt={playback.artUrl} />
      <QueueSidebar
        autoplay={autoplay}
        variant="skinny"
        items={queueItems}
        setItems={setQueueItems}
        isLoading={queueLoading}
        error={queueError}
        currentObjectId={playback.currentObjectId}
        currentQueueItemId={playback.queueItemId}
        positionMs={playback.positionMs}
        currentTrackDurationMs={playback.durationMs}
        groupName={groups.find(g => g.id === activeGroupId)?.name ?? null}
        onRefresh={reloadQueue}
        onError={showToast}
        onAddToQueue={() => {}}
      />
      <SkinnyTransport np={np} isAuthed={isAuthed} />
    </div>
  );
}
