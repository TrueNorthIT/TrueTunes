import { createContext, useContext } from 'react';

export type ToastType = 'error' | 'success' | 'info';

export interface ToastCtx {
  showToast: (message: string, type?: ToastType) => void;
}

// Platform-neutral toast contract (desktop keeps this inside components/common/Toast.tsx).
// The RN UI layer supplies a real provider; the default is a no-op.
export const ToastContext = createContext<ToastCtx>({ showToast: () => {} });

export function useToast(): ToastCtx {
  return useContext(ToastContext);
}
