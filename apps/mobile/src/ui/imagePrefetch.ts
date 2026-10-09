import { Image } from 'expo-image';
import { createSeen } from '../logic/lib/prefetch';

const requested = createSeen(3000);

/** Download an image into expo-image's memory + disk cache once, ahead of the screen that shows it. */
export function warmImage(url: string | null | undefined): void {
  if (!url || !requested.add(url)) return;
  Image.prefetch(url, 'memory-disk').catch(() => {
    // Best effort; allow a retry later if it failed.
  });
}
