import { useEffect } from 'react';
import { PillButton } from '../components/common/PillButton';
import styles from './SignIn.module.css';

interface Props {
  /** 'offline': no connection. 'failed': the app could not start (a file would not load, say). */
  reason?: 'offline' | 'failed';
}

/** Shown in place of the app when it cannot start: no connection, or a start-up failure. Never a blank page. */
export function Offline({ reason = 'offline' }: Props) {
  // Back online: straight into the app.
  useEffect(() => {
    const reload = () => location.reload();
    window.addEventListener('online', reload);
    return () => window.removeEventListener('online', reload);
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
