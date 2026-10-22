import { createContext, useCallback, useContext, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from '../../styles/Toast.module.css';

type ToastType = 'error' | 'success' | 'info';

interface ToastOptions {
  /** A single button on the toast (e.g. Undo). The toast closes when it is clicked. */
  action?: { label: string; onClick: () => void };
  durationMs?: number;
}

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  action?: ToastOptions['action'];
}

interface ToastCtx {
  showToast: (message: string, type?: ToastType, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastCtx>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;
const DISMISS_MS = 4000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => setToasts(prev => prev.filter(t => t.id !== id)), []);

  const showToast = useCallback((message: string, type: ToastType = 'error', options?: ToastOptions) => {
    const id = nextId++;
    setToasts(prev => [...prev, { id, message, type, action: options?.action }]);
    setTimeout(() => dismiss(id), options?.durationMs ?? DISMISS_MS);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {createPortal(
        <div className={styles.container}>
          {toasts.map(t => (
            <div key={t.id} className={`${styles.toast} ${styles[t.type]}`}>
              {t.message}
              {t.action && (
                <button
                  type="button"
                  className={styles.action}
                  onClick={() => { t.action?.onClick(); dismiss(t.id); }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}
