/** Lowercase, strip diacritics, a leading "the" and everything but letters and digits. */
function normaliseName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^\s*the\s+/, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/** Same artist name, ignoring case, punctuation, diacritics and a leading "the". Empty never matches. */
export function namesMatch(a: string, b: string): boolean {
  const na = normaliseName(a);
  return na !== '' && na === normaliseName(b);
}

/** The first search hit whose primary artist is the one asked for; null rather than a near miss. */
export function pickArtistHit<T extends { result: { primary_artist: { name: string } } }>(hits: T[], artistName: string): T | null {
  return hits.find((h) => namesMatch(h.result.primary_artist.name, artistName)) ?? null;
}
