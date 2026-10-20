import { useEffect, useState } from 'react';
import { Minus, Maximize2, Minimize2, X, DownloadCloud, Vote } from 'lucide-react';
import { usePolls } from '../hooks/usePolls';
import { PollAnswerDialog } from './polls/PollAnswerDialog';
import styles from '../styles/WindowControls.module.css';

export function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [pollOpen, setPollOpen] = useState(false);
  const polls = usePolls();

  useEffect(() => {
    window.sonos.isWindowMaximized().then(setIsMaximized).catch(() => {});
    return window.sonos.onWindowMaximized(setIsMaximized);
  }, []);

  useEffect(() => window.sonos.onUpdateDownloaded(setUpdateVersion), []);

  return (
    <>
      {updateVersion && (
        <button
          className={styles.titleBarUpdateBtn}
          onClick={() => window.sonos.installUpdate()}
          title={`v${updateVersion} ready — click to restart and install`}
        >
          <DownloadCloud size={13} />
          <span>Update</span>
        </button>
      )}
      {polls.current && (
        <button
          className={styles.titleBarPollBtn}
          onClick={() => setPollOpen(true)}
          title="A poll is waiting for your answer"
        >
          <Vote size={13} className={styles.pollIcon} />
          <span>Poll</span>
        </button>
      )}
      <button className={styles.winBtn} onClick={() => window.sonos.minimizeWindow()} title="Minimise">
        <Minus size={13} />
      </button>
      <button
        className={styles.winBtn}
        onClick={() => window.sonos.maximizeWindow()}
        title={isMaximized ? 'Restore' : 'Maximise'}
      >
        {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
      </button>
      <button
        className={`${styles.winBtn} ${styles.closeBtn}`}
        onClick={() => window.sonos.closeWindow()}
        title="Close"
      >
        <X size={13} />
      </button>
      {pollOpen && polls.current && (
        <PollAnswerDialog
          poll={polls.current}
          remaining={polls.remaining}
          submitting={polls.submitting}
          error={polls.error}
          onChoose={polls.answer}
          onClose={() => setPollOpen(false)}
        />
      )}
    </>
  );
}
