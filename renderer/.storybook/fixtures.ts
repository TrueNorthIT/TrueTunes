// Local fixture art for stories: SVG data URIs, so nothing touches the network and every render is the same.
// They go through the real image cache (fetch of a data: URL works in a browser) exactly as a service URL would.

const svg = (body: string, size = 600) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 600 600">${body}</svg>`
  )}`;

const cover = (id: string, from: string, to: string, shape: string) =>
  svg(
    `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>` +
      `<rect width="600" height="600" fill="url(#${id})"/>${shape}`
  );

/** Album covers: saturated, so the dominant-colour wash has something to pick up. */
export const covers = {
  sunset: cover('a', '#ff7a45', '#7a1f5c', '<circle cx="300" cy="360" r="170" fill="#ffd27a" opacity="0.85"/>'),
  ocean: cover(
    'b',
    '#1f8fff',
    '#0b2a5c',
    '<path d="M0 380 Q150 320 300 380 T600 380 V600 H0Z" fill="#7fd6ff" opacity="0.7"/>'
  ),
  forest: cover('c', '#2fb66a', '#0d3b2a', '<polygon points="300,120 460,460 140,460" fill="#c9f5d8" opacity="0.7"/>'),
  neon: cover(
    'd',
    '#ff3d9a',
    '#3a1fa0',
    '<rect x="170" y="170" width="260" height="260" fill="none" stroke="#7ff" stroke-width="22"/>'
  ),
};

/** A portrait standing in for an artist or a person's photo. */
export const portrait = cover(
  'p',
  '#c98a5c',
  '#3b2a2a',
  '<circle cx="300" cy="230" r="95" fill="#f1d0b4"/><path d="M110 600 Q300 330 490 600Z" fill="#f1d0b4"/>'
);

/** The flat grey silhouette the music service sends for an artist with no photo (TopResultCard treats it as no art). */
export const greySilhouette = svg('<rect width="600" height="600" fill="#808080"/>');

/** Last week's Queuedle champion, for the gold-ring states (week of 19–25 Oct). */
export const championOf = (userName: string) => ({
  userName,
  total: 65,
  gamesPlayed: 5,
  bestTotal: 18,
  range: { from: '2026-10-19', to: '2026-10-25' },
});
