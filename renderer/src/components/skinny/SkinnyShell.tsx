import type { usePlayback } from '../../hooks/usePlayback';
import { useNowPlaying } from '../../hooks/useNowPlaying';
import type { NormalizedQueueItem, NormalizedGroup } from '../../types/provider';
import { QueueSidebar } from '../queue/QueueSidebar';
import { SkinnyTransport } from './SkinnyTransport';
import { AmbientBackdrop } from '../AmbientBackdrop';
import { useDisplayName } from '../../hooks/useDisplayName';
import { useToast } from '../common/Toast';
import styles from '../../styles/SkinnyShell.module.css';

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
  queueLoading,
  queueReadOnly,
  queueError,
  reloadQueue,
  groups,
  activeGroupId,
}: Props) {
  const np = useNowPlaying(playback);
  const displayName = useDisplayName();
  const { showToast } = useToast();

  return (
    <div className={styles.shell}>
      <AmbientBackdrop nowPlayingArt={playback.artUrl} />
      <QueueSidebar
        autoplay={autoplay}
        viewer={displayName}
        variant="skinny"
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
      <SkinnyTransport np={np} isAuthed={isAuthed} />
    </div>
  );
}
