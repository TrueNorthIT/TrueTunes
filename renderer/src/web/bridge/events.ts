// Subscriptions for the bridge's `on*` methods. React subscribes in effects, often after the event has already
// happened (the Electron preload buffers for the same reason), so a sticky channel tells a late subscriber the
// last value on a later microtask: never inside the subscribe call, which would run the callback before the
// caller has the unsubscribe function.

export interface Channel<T> {
  on(cb: (value: T) => void): Unsubscribe;
  emit(value: T): void;
  /** Replaces what a late subscriber is told, without telling the current ones. */
  remember(value: T): void;
  /** Forgets the value: a late subscriber hears nothing until the next emit. */
  clear(): void;
}

export function channel<T>({ sticky = true }: { sticky?: boolean } = {}): Channel<T> {
  const subs = new Set<(value: T) => void>();
  let last: { value: T } | null = null;
  return {
    on(cb) {
      subs.add(cb);
      const seen = last;
      if (seen) {
        queueMicrotask(() => {
          if (last === seen && subs.has(cb)) cb(seen.value);
        });
      }
      return () => {
        subs.delete(cb);
      };
    },
    emit(value) {
      if (sticky) last = { value };
      for (const cb of [...subs]) cb(value);
    },
    remember(value) {
      last = { value };
    },
    clear() {
      last = null;
    },
  };
}
