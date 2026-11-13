import { useEffect } from 'react';
import { PillButton } from '../components/common/PillButton';
import styles from './SignIn.module.css';

interface Props {
  /** 'offline': no connection. 'failed': the app could not start (a file would not load, say). */
  reason?: 'offline' | 'failed';
}

/** Shown in place of the app when it cannot start: no connection, or a start-up failure. Never a blank page. */
export function Offline({ reason = 'offline' }: Props) {
  // Back online: straight into the app. Not while the page is already on its way somewhere else (the demo link,
  // say): a browser can report "online" in that moment, and a reload then would win over where the user was going.
  useEffect(() => {
    let leaving = false;
    const leave = () => void (leaving = true);
    const reload = () => {
      if (!leaving) location.reload();
    };
    window.addEventListener('online', reload);
    window.addEventListener('beforeunload', leave);
    window.addEventListener('pagehide', leave);
    return () => {
      window.removeEventListener('online', reload);
      window.removeEventListener('beforeunload', leave);
      window.removeEventListener('pagehide', leave);
    };
  }, []);

  return (
    <main className={`page-scale ${styles.screen}`}>
      <div className={styles.inner}>
        <h1 className={styles.name}>True Tunes</h1>
        <p className={styles.line} role="status">
          {reason === 'offline'
            ? 'You’re offline. True Tunes needs a connection to reach the office.'
            : 'True Tunes couldn’t start. Check your connection and try again.'}
        </p>
        <PillButton variant="primary" className={styles.button} onClick={() => location.reload()}>
          Try again
        </PillButton>
        <a className={styles.demo} href="/demo">
          Open the demo
        </a>
      </div>
    </main>
  );
}
