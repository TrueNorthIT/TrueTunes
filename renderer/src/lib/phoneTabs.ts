// The phone shell's five tabs (components/phone/TabBar.tsx), and which of them a route belongs to.

export type PhoneTab = '/' | '/search' | '/queue' | '/discover' | '/more';

const ROOTS: readonly PhoneTab[] = ['/', '/search', '/queue', '/discover', '/more'];

/**
 * The tab a path belongs to, or null for a page that can be reached from any of them (an album, an artist,
 * a shelf, the lyrics, Now playing): those keep the tab they were opened from lit.
 * The pages listed on More (Leaderboard, Queuedle, profiles and their playlists) belong to More.
 */
export function tabOf(pathname: string): PhoneTab | null {
  const root = ROOTS.find((t) => t === pathname);
  if (root) return root;
  if (/^\/(leaderboard|queuedle|profile|playlist)(\/|$)/.test(pathname)) return '/more';
  return null;
}

/** True on a tab's own page, where there is nothing to go back to. */
export const isTabRoot = (pathname: string): boolean => ROOTS.some((t) => t === pathname);
