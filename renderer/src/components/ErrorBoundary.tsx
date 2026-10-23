import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { PillButton } from './common/PillButton';
import styles from '../styles/ErrorBoundary.module.css';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Last-resort screen when rendering crashes: plain words first, the technical message folded away for a bug report. */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
    window.sonos
      .trackEvent('renderer_crash', {
        message: error.message,
        stack: (error.stack ?? '').slice(0, 500),
      })
      .catch(() => {});
  }

  override render() {
    if (this.state.error) {
      return (
        // The crash takes the title bar with it, so the whole screen is a drag region: the window can still move.
        <div className={`page-scale ${styles.shell}`}>
          <div className={styles.card} role="alert">
            <h1 className={styles.heading}>Something went wrong</h1>
            <p className={styles.message}>
              True Tunes hit a problem and stopped drawing this screen. Reloading usually fixes it. The music keeps
              playing either way.
            </p>
            <details className={styles.details}>
              <summary>Error details</summary>
              <pre className={styles.trace}>{this.state.error.message}</pre>
            </details>
            <PillButton variant="primary" onClick={() => window.location.reload()}>
              Reload
            </PillButton>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
