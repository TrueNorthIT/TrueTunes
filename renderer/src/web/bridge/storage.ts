// localStorage that never throws: it can be blocked (private windows, site settings) and the app must still run.

export interface Store {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export function createStore(storage: Storage | undefined): Store {
  return {
    get(key) {
      try {
        return storage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        storage?.setItem(key, value);
      } catch {
        /* blocked: the preference just does not persist */
      }
    },
    remove(key) {
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
