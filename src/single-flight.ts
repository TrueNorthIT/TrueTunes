// Kept free of Electron imports so `npm run test:main` can exercise it.

/** Wraps `fn` so callers arriving while a run is in flight share its result instead of starting another. */
export function singleFlight<T>(fn: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;
  return () => {
    inFlight ??= fn().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}
