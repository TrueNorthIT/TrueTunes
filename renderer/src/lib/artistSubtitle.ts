/**
 * Card subtitles are comma-separated artist lists ("Keane, Everything Everything"). On an artist's own
 * page the page artist is redundant: drop it and show the others as "with Keane". Undefined when nothing
 * remains. Without a page artist the subtitle is returned unchanged.
 */
export function withoutPageArtist(subtitle: string | undefined, pageArtist: string | undefined): string | undefined {
  const text = subtitle?.trim();
  if (!text) return undefined;
  const page = pageArtist?.trim().toLowerCase();
  if (!page) return text;
  const others = text
    .split(',')
    .map((n) => n.trim())
    .filter((n) => n && n.toLowerCase() !== page);
  return others.length ? `with ${others.join(', ')}` : undefined;
}

/** "2019 · with Beck", "2019", "with Beck" or undefined. */
export function cardSubtitle(
  year: number | undefined,
  subtitle: string | undefined,
  pageArtist: string | undefined,
): string | undefined {
  return [year, withoutPageArtist(subtitle, pageArtist)].filter(Boolean).join(' · ') || undefined;
}
