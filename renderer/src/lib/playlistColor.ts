/** No purple: fold any hue onto 0–250° or 330–360°, skipping the 250–330° violets. */
function noViolet(h: number): number {
  const hue = ((h % 280) + 280) % 280;
  return hue < 250 ? hue : hue + 80;
}

export function getPlaylistColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0;
  }
  const hue = noViolet(Math.abs(hash));
  return `linear-gradient(135deg, hsl(${hue},45%,28%), hsl(${noViolet(hue + 50)},50%,20%))`;
}
