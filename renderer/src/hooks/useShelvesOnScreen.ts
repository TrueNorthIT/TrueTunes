import { useState } from 'react';
import { mergeShelves } from '../lib/ytmSections';
import type { SonosItem } from '../types/sonos';

/**
 * Home's "For you" cards as they should stay on screen. The first load (each time Home mounts) is shown as it
 * comes; a refetch while Home is open, such as the quiet one after a stale card is opened, is merged in with
 * mergeShelves, so cards keep their places and pick up fresh ids, and nothing is reordered or removed in front
 * of the user. Cards that dropped off Home go the next time Home mounts.
 */
export function useShelvesOnScreen(fresh: SonosItem[] | undefined): SonosItem[] {
  const [seen, setSeen] = useState(fresh);
  const [shown, setShown] = useState(fresh ?? []);
  // Adjusting state while rendering (React's pattern for deriving from a changed prop): no flash of the old list.
  if (fresh !== seen) {
    setSeen(fresh);
    if (fresh) setShown(seen ? mergeShelves(shown, fresh) : fresh);
  }
  return shown;
}
