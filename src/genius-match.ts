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

// Edition markers: a suffix carrying one of these names another edition of the same album.
const EDITION = /\b(edition|deluxe|remaster(ed)?|anniversary|expanded|bonus|special|ep)\b/i;

/** "Royal Blood (10th Anniversary Edition)" -> "Royal Blood": strips trailing (…), […] or " - …" edition suffixes and a bare "Deluxe", "Remastered" or "EP". */
export function albumBaseTitle(title: string): string {
  let t = title.trim();
  for (;;) {
    const m = t.match(/^(.*?\S)\s*[([]((?:[^()[\]]|\([^()]*\))*)[)\]]$/) ?? t.match(/^(.*\S)\s+-\s+(.+)$/);
    if (!m || !EDITION.test(m[2])) break;
    t = m[1];
  }
  return t.replace(/\s+(deluxe|remastered|ep)$/i, '').trim();
}

/**
 * The hits from a Genius album search that are this album by this artist: the exact title first, then other
 * editions (same base title). Never another artist's album, whatever its title.
 */
export function pickAlbumHits<T extends { result: { name: string; artist?: { name: string } | null } }>(
  hits: T[],
  albumName: string,
  artistName: string,
): T[] {
  const mine = hits.filter((h) => h.result.artist && namesMatch(h.result.artist.name, artistName));
  const exact = mine.filter((h) => namesMatch(h.result.name, albumName));
  const base = albumBaseTitle(albumName);
  const editions = mine.filter((h) => !exact.includes(h) && namesMatch(albumBaseTitle(h.result.name), base));
  return [...exact, ...editions];
}

type GeniusDom = string | { children?: GeniusDom[] } | null | undefined;
const domText = (n: GeniusDom): string => (typeof n === 'string' ? n : (n?.children ?? []).map(domText).join(''));

/** A Genius description with any real text. Genius writes "?" (or an empty root) where nobody has written one. */
export function geniusHasText(dom: unknown): boolean {
  const t = domText(dom as GeniusDom).trim();
  return t !== '' && t !== '?';
}
