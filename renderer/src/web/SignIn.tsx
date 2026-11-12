import { PillButton } from '../components/common/PillButton';
import styles from './SignIn.module.css';

interface Props {
  onSignIn: () => void;
  /** The last attempt did not complete. */
  failed?: boolean;
}

/** The web app's front door: the wordmark, one button to Microsoft's sign-in, and the way to the demo. */
export function SignIn({ onSignIn, failed = false }: Props) {
  return (
    <main className={`page-scale ${styles.screen}`}>
      <div className={styles.inner}>
        <h1 className={styles.name}>True Tunes</h1>
        <p className={styles.line}>The office&rsquo;s shared jukebox.</p>
        {failed && (
          <p className={styles.failed} role="alert">
            Sign-in didn&rsquo;t complete. Try again.
          </p>
        )}
        <PillButton variant="primary" className={styles.button} onClick={onSignIn}>
          Sign in with Microsoft
        </PillButton>
        <a className={styles.demo} href="/demo">
          Try the demo
        </a>
      </div>
    </main>
  );
}
