import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ToastContext } from '../logic/context/ToastContext';
import type { ToastType } from '../logic/context/ToastContext';
import { colors, radius, space } from './theme';

const RemoteToastContext = createContext<(msg: string, type?: ToastType) => void>(() => {});
export const useShowToast = () => useContext(RemoteToastContext);

/** Provides the shared ToastContext (used by the ported hooks) and renders the toast overlay. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    setToast({ message, type });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      <RemoteToastContext.Provider value={showToast}>
        {children}
        {toast && (
          <View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + 96 }]}>
            <View
              style={[styles.toast, toast.type === 'error' && styles.error, toast.type === 'success' && styles.success]}
            >
              <Text style={styles.text}>{toast.message}</Text>
            </View>
          </View>
        )}
      </RemoteToastContext.Provider>
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: space.lg, right: space.lg, alignItems: 'center' },
  toast: {
    backgroundColor: colors.bg1,
    borderColor: colors.border2,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  error: { borderColor: colors.danger },
  success: { borderColor: colors.success },
  text: { color: colors.text, fontSize: 14 },
});
