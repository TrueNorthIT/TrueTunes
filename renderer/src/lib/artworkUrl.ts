/**
 * YouTube Music artwork URLs end in a size spec such as "=w544-h544-l90-rj". Rewrites the
 * width/height so a hero can request a large image; URLs without that spec are returned unchanged.
 */
export function withArtworkSize(url: string, size = 2000): string {
  return url.replace(/=w\d+-h\d+/, `=w${size}-h${size}`);
}
