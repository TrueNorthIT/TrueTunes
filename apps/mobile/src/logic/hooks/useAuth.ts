import { useEffect, useState } from 'react';

export function useAuth(): boolean {
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    const unsubReady   = window.sonos.onAuthReady(()   => setIsAuthed(true));
    const unsubExpired = window.sonos.onAuthExpired(() => setIsAuthed(false));
    return () => { unsubReady(); unsubExpired(); };
  }, []);

  return isAuthed;
}
