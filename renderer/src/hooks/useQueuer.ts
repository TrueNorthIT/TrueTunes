import { useAttribution, resolveAttribution } from './useAttribution';
import { useUsers } from './useUsers';

/**
 * Who queued the playing track, with their photo: the same attribution the queue rows show.
 * Null when nobody in the office queued it (the DJ, or the Sonos app).
 */
export function useQueuer(track: { id?: string | null; title?: string | null; artist?: string | null }) {
  const attribution = useAttribution();
  const { data: users } = useUsers(true, true);
  const entry = resolveAttribution(attribution, track);
  if (!entry) return null;
  return { user: entry.user, imageUrl: users?.find((u) => u.userId === entry.user)?.imageUrl ?? null };
}
