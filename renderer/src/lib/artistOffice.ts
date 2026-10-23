/** Lowercase letters and digits only, a leading "the" dropped: "The Beatles" and "beatles" are one artist. */
function norm(name: string): string {
  return name
    .toLowerCase()
    .replace(/^\s*the\s+/, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * How many times the office has queued this artist (all time), matched by id then by normalised name.
 * undefined when the artist is not in the list. The stats have no per-user split, so who queued them is not claimed.
 */
export function officeCountFor(
  topArtists: StatsArtist[] | undefined,
  artistId: string | undefined,
  name: string
): number | undefined {
  const n = norm(name);
  const hit =
    (artistId ? topArtists?.find((a) => a.artistId === artistId) : undefined) ??
    (n ? topArtists?.find((a) => norm(a.artist) === n) : undefined);
  return hit && hit.count >= 1 ? hit.count : undefined;
}
