import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import styles from '../styles/ErrorBoundary.module.css';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
    window.sonos
      .trackEvent('renderer_crash', {
        message: error.message,
        stack: (error.stack ?? '').slice(0, 500),
      })
      .catch(() => {});
  }

  render() {
    if (this.state.error) {
      return (
        <div className={styles.shell}>
          <div className={styles.card}>
            <div className={styles.icon}>⚠</div>
            <h2 className={styles.heading}>Something went wrong</h2>
            <p className={styles.message}>{this.state.error.message}</p>
            <button className={styles.btn} onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
