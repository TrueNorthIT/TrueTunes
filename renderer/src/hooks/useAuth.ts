import { useCallback, useEffect, useState } from 'react';

export function useAuth(): boolean {
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    const unsubReady = window.sonos.onAuthReady(() => setIsAuthed(true));
    const unsubExpired = window.sonos.onAuthExpired(() => setIsAuthed(false));
    return () => {
      unsubReady();
      unsubExpired();
    };
  }, []);

  return isAuthed;
}

/** Whether the main process could not get a Sonos session from our server, and the Retry that asks it to try again. */
export function useAuthFailure(): { failed: boolean; retry: () => void } {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const unsubFailed = window.sonos.onAuthFailed(() => setFailed(true));
    const unsubReady = window.sonos.onAuthReady(() => setFailed(false));
    return () => {
      unsubFailed();
      unsubReady();
    };
  }, []);

  const retry = useCallback(() => {
    setFailed(false);
    // A failed retry arrives as onAuthFailed again; only a rejected IPC call needs handling here.
    window.sonos.retrySonosAuth().catch(() => setFailed(true));
  }, []);

  return { failed, retry };
}
