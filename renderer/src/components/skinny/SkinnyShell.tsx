import type React from 'react';
import type { usePlayback } from '../../hooks/usePlayback';
import { useNowPlaying } from '../../hooks/useNowPlaying';
import type { NormalizedQueueItem, NormalizedGroup } from '../../types/provider';
import { QueueSidebar } from '../queue/QueueSidebar';
import { SkinnyTransport } from './SkinnyTransport';
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
 * Skinny side-panel layout: just the queue (full width) plus a condensed
 * transport strip at the bottom. No nav, no search, no browse panels.
 * Shown automatically when the window is narrower than FULL_MIN.
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

  // Ambient dominant-colour glow centred around the middle of the panel,
  // fading out toward the top and bottom — keeps the app's glow-y aesthetic.
  const shellStyle: React.CSSProperties | undefined = np.dominantColor
    ? {
        background: `radial-gradient(135% 70% at 50% 50%, rgba(${np.dominantColor}, 0.30) 0%, rgba(${np.dominantColor}, 0.11) 48%, transparent 85%), var(--bg)`,
      }
    : undefined;

  return (
    <div className={styles.shell} style={shellStyle}>
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
