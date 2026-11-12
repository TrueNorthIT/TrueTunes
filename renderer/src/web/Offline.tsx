import { useEffect } from 'react';
import { PillButton } from '../components/common/PillButton';
import styles from './SignIn.module.css';

/** Shown when the app opens with no connection: the office's speakers cannot be reached from here. */
export function Offline() {
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
          You&rsquo;re offline. True Tunes needs a connection to reach the office.
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
