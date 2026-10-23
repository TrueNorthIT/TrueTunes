/** Mirrors MIN_DOCKED_WIDTH in components/queue/QueueSidebar.tsx: the narrowest the docked queue gets. */
export const MIN_DOCKED_WIDTH = 280;
/** Room the floating player bar needs beside the queue: its 800px width plus 32px either side. */
export const PLAYER_ROOM = 800 + 64;

/**
 * The docked queue's width for this window: the user's saved width, narrowed so the player bar
 * still fits, never below the minimum. Derive it on every resize and never store it back as the
 * preference, or a trip through a narrow window shrinks the queue for good.
 */
export function effectiveDockedWidth(preferred: number, windowWidth: number): number {
  return Math.max(MIN_DOCKED_WIDTH, Math.min(preferred, windowWidth - PLAYER_ROOM));
}
