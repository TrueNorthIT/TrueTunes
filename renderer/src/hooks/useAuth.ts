import { useEffect, useRef, useState } from 'react';

export function useAuth(): boolean {
  const [isAuthed, setIsAuthed] = useState(false);
  const registered = useRef(false);

  useEffect(() => {
    if (registered.current) return;
    registered.current = true;
    window.sonos.onAuthReady(() => setIsAuthed(true));
    window.sonos.onAuthExpired(() => setIsAuthed(false));
  }, []);

  return isAuthed;
}
