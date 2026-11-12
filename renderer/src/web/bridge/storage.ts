// A key-value store over localStorage that never throws. Site data can be blocked (private windows, settings), so
// an in-memory Map always wins and writes go through to storage best-effort: a preference set this page load
// holds even when it cannot be persisted.

export interface Store {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export function createStore(storage: Storage | undefined): Store {
  const memory = new Map<string, string | null>();
  return {
    get(key) {
      if (memory.has(key)) return memory.get(key) ?? null;
      try {
        return storage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    set(key, value) {
      memory.set(key, value);
      try {
        storage?.setItem(key, value);
      } catch {
        /* blocked: held in memory only */
      }
    },
    remove(key) {
      memory.set(key, null);
      try {
        storage?.removeItem(key);
      } catch {
        /* blocked */
      }
    },
  };
}

/** `window.localStorage`, or undefined where even looking at it throws. */
export function browserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
