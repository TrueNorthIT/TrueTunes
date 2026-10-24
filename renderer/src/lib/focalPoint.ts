/**
 * Where to crop a wide hero out of a (usually square) artist photo. Everything here is a fraction of the image
 * height (0 top, 1 bottom) until `objectPositionY` turns it into an `object-position` percentage.
 */

/** How far down the visible band a detail focus sits: under the nav, above the name. */
export const FOCUS_ANCHOR = 0.42;

/**
 * The `object-position` y percentage that puts `focusY` at `anchor` down the visible band, for `object-fit: cover`.
 * `imgAspect` and `boxAspect` are width / height. When the box is not wider than the image nothing is cropped
 * vertically, so any value works; 50 is returned.
 */
export function objectPositionY(focusY: number, imgAspect: number, boxAspect: number, anchor = FOCUS_ANCHOR): number {
  const visible = imgAspect / boxAspect; // the visible band's height, as a fraction of the image height
  if (!(visible > 0) || visible >= 1) return 50;
  const top = focusY - anchor * visible;
  return Math.round(Math.min(1, Math.max(0, top / (1 - visible))) * 1000) / 10;
}

/** Faces found: the eye line sits a third of the way down the visible band, clear of the nav. */
export const FACE_ANCHOR = 1 / 3;

/** A detected face, normalised to the image (0–1). `eyeY` is the eye line when the detector gives keypoints. */
export interface DetectedFace {
  top: number;
  height: number;
  width: number;
  eyeY?: number;
}

/**
 * The focus for detected faces: their eye lines, nearer the highest one (30% of the way down the spread) so the top
 * faces of a group stay clear of the floating nav. The group is built around the largest face: only faces at least
 * a quarter its size, with eye lines within GROUP_SPAN of its own, count, so a stray face elsewhere in the frame (a
 * face on a T-shirt, a poster) cannot drag the crop off the band. Largest five. null with no faces.
 */
/** How far (fraction of image height) a face's eyes can sit from the largest face's and still share its crop. A wide
 * hero shows about a third of a square photo. */
const GROUP_SPAN = 0.25;

export function faceFocusY(faces: DetectedFace[]): number | null {
  const area = (f: DetectedFace) => f.width * f.height;
  const eye = (f: DetectedFace) => f.eyeY ?? f.top + 0.4 * f.height;
  const sorted = [...faces].sort((a, b) => area(b) - area(a));
  const lead = sorted[0];
  if (!lead || !(area(lead) > 0)) return null;
  const main = sorted
    .filter((f) => area(f) >= area(lead) / 4 && Math.abs(eye(f) - eye(lead)) <= GROUP_SPAN)
    .slice(0, 5);
  const eyes = main.map(eye);
  const top = Math.min(...eyes);
  return Math.min(1, Math.max(0, top + 0.3 * (Math.max(...eyes) - top)));
}

/** No faces found: faces usually sit in the upper-middle of an artist photo, so detail there counts most. */
const PRIOR_CENTRE = 0.35;
const PRIOR_SPREAD = 0.15;

/**
 * The focus: the centre of the horizontal band (`band` of the height) with the most detail, measured as luminance
 * change between neighbouring pixels and weighted towards where faces usually are, so a busy shirt or railing
 * low in the frame does not win. `rgba` is canvas ImageData, `w` × `h`. null for a flat image.
 * ponytail: tuned on five real photos (Adele, Tame Impala, Jungle, Wolf Alice, Billie Eilish); it is only the
 * fallback for when the face detector finds nothing or fails to load.
 */
export function detailFocusY(rgba: ArrayLike<number>, w: number, h: number, band = 0.4): number | null {
  if (w < 2 || h < 2 || rgba.length < w * h * 4) return null;
  const lum = (i: number) => 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  const rows: number[] = [];
  for (let y = 0; y < h; y++) {
    let e = 0;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x + 1 < w) e += Math.abs(lum(i + 1) - lum(i));
      if (y + 1 < h) e += Math.abs(lum(i + w) - lum(i));
    }
    const d = (y + 0.5) / h - PRIOR_CENTRE;
    rows.push(e * Math.exp(-(d * d) / (2 * PRIOR_SPREAD * PRIOR_SPREAD)));
  }
  const span = Math.max(1, Math.round(band * h));
  let sum = rows.slice(0, span).reduce((a, b) => a + b, 0);
  let best = sum,
    bestStart = 0;
  for (let s = 1; s + span <= h; s++) {
    sum += rows[s + span - 1] - rows[s - 1];
    if (sum > best) {
      best = sum;
      bestStart = s;
    }
  }
  if (best <= 0) return null;
  return (bestStart + span / 2) / h;
}
