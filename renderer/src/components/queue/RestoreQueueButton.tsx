import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useRestoreQueuePreview, type RestoreSummary } from '../../hooks/useRestoreQueue';
import buttonStyles from '../../styles/QueueSidebar.module.css';
import styles from '../../styles/RestoreQueueDialog.module.css';

interface Props {
  currentObjectIds: Set<string>;
  onRestore: (tracks: RecentQueuedTrack[]) => Promise<RestoreSummary>;
  onResult: (msg: string) => void;
}

export function RestoreQueueButton({ currentObjectIds, onRestore, onResult }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className={buttonStyles.iconBtn}
        onClick={() => setOpen(true)}
        title="Restore queue from cloud"
      >
        ☁
      </button>
      {open && (
        <RestoreQueueDialog
          currentObjectIds={currentObjectIds}
          onRestore={onRestore}
          onResult={onResult}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

interface DialogProps extends Props {
  onClose: () => void;
}

function RestoreQueueDialog({ currentObjectIds, onRestore, onResult, onClose }: DialogProps) {
  const preview = useRestoreQueuePreview(true);
  const [busy, setBusy] = useState(false);

  const allTracks = preview.data?.tracks ?? [];

  const eligible = useMemo(
    () => allTracks.filter((t) => !currentObjectIds.has(t.uri)),
    [allTracks, currentObjectIds],
  );

  async function handleConfirm() {
    if (busy || eligible.length === 0) return;
    setBusy(true);
    try {
      const summary = await onRestore(eligible);
      const msg = summary.failed === 0
        ? `Restored ${summary.added} track${summary.added !== 1 ? 's' : ''}`
        : `Restored ${summary.added}, ${summary.failed} failed${summary.firstError ? `: ${summary.firstError}` : ''}`;
      onResult(msg);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={styles.overlay}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape' && !busy) onClose(); }}
    >
      <div className={styles.modal}>
        <button className={styles.close} onClick={onClose} disabled={busy} aria-label="Close">✕</button>
        <h2 className={styles.heading}>Restore queue from cloud</h2>
        <p className={styles.sub}>
          Re-add tracks queued today (across the whole household). Restored tracks
          won&apos;t be re-logged to the leaderboard.
        </p>

        {preview.isLoading && (
          <div className={styles.state}><Loader2 size={18} className={styles.spinner} /> Loading…</div>
        )}
        {preview.error && (
          <div className={styles.state}>Failed to load: {String(preview.error)}</div>
        )}
        {preview.data?.error && (
          <div className={styles.state}>Failed to load: {preview.data.error}</div>
        )}

        {!preview.isLoading && !preview.error && allTracks.length === 0 && (
          <div className={styles.state}>Nothing queued today.</div>
        )}

        {allTracks.length > 0 && (
          <>
            <div className={styles.summary}>
              {eligible.length} of {allTracks.length} not in current queue
            </div>
            <ul className={styles.list}>
              {allTracks.map((t) => {
                const skipped = currentObjectIds.has(t.uri);
                return (
                  <li key={t.uri} className={skipped ? styles.skipped : undefined}>
                    {t.imageUrl && <img className={styles.art} src={t.imageUrl} alt="" />}
                    <div className={styles.text}>
                      <div className={styles.trackName}>{t.trackName}</div>
                      <div className={styles.artist}>
                        {t.artist}
                        <span className={styles.queuer}> · {t.queuedBy}</span>
                      </div>
                    </div>
                    {skipped && <span className={styles.skipBadge}>in queue</span>}
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <div className={styles.actions}>
          <button className={styles.cancel} onClick={onClose} disabled={busy}>Cancel</button>
          <button
            className={styles.confirm}
            onClick={handleConfirm}
            disabled={busy || eligible.length === 0}
          >
            {busy
              ? 'Restoring…'
              : `Restore ${eligible.length} track${eligible.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
