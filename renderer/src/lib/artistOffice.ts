/** Lowercase letters and digits only, a leading "the" dropped: "The Beatles" and "beatles" are one artist. */
function norm(name: string): string {
  return name.toLowerCase().replace(/^\s*the\s+/, '').replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * "Played here 27 times": the office's all-time count for this artist, matched by id then by normalised name.
 * undefined when the artist is not in the list. Who queued them most is not in the stats, so it is not claimed.
 */
export function officeLineFor(
  topArtists: StatsArtist[] | undefined,
  artistId: string | undefined,
  name: string,
): string | undefined {
  const n = norm(name);
  const hit =
    (artistId ? topArtists?.find(a => a.artistId === artistId) : undefined) ??
    (n ? topArtists?.find(a => norm(a.artist) === n) : undefined);
  if (!hit || hit.count < 1) return undefined;
  return `Played here ${hit.count === 1 ? 'once' : `${hit.count} times`}`;
}
