import type { PhotoState } from './photoPlaceholder';

/** What the hero's portrait slot shows: the artist photo whole, or a cover hung as a square print. */
export interface HeroPortrait {
  kind: 'photo' | 'print';
  url: string;
}

/**
 * The photo once it is known to be real; otherwise the latest release's cover, then the first top song's art.
 * null while the photo is still being checked (so the hero never commits early) or when there is nothing at all.
 * The portrait is also the hero's colour source.
 */
export function heroPortrait(
  photo: PhotoState,
  photoUrl: string | null,
  latestArt: string | null,
  songArt: (string | null | undefined)[]
): HeroPortrait | null {
  if (photo === 'unknown') return null;
  if (photo === 'photo' && photoUrl) return { kind: 'photo', url: photoUrl };
  const art = latestArt ?? songArt.find(Boolean) ?? null;
  return art ? { kind: 'print', url: art } : null;
}

/** "A, B, C" as names, for a shared credit that has nothing filed under it. */
export function creditNames(name: string): string[] {
  return name.split(/\s*,\s*/).filter(Boolean);
}
