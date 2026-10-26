/**
 * The bubble cloud of who a pick is for: each person's face sized by how much they like the artist, laid out as a
 * sunflower head (the biggest in the middle, the rest stepping out at the golden angle) on the right of a pick card.
 * Pure maths, all in `em`, so the card scales it.
 */

export type BubbleCardSize = 'large' | 'medium';

/** A person a pick is for. `count` is their all-time queues of the artist; absent on older servers. */
export interface BubblePerson {
  user: string;
  count?: number;
}

export type SizedBubble =
  { kind: 'face'; user: string; count?: number; r: number } | { kind: 'more'; more: number; r: number };

export type Bubble = SizedBubble & { x: number; y: number };

export interface BubbleLayout {
  bubbles: Bubble[];
  /** The cloud's bounding box. Bubble x/y are centres inside it. */
  width: number;
  height: number;
  /** The centre face's centre: the point the head breathes from. */
  origin: { x: number; y: number };
}

/** Bubble radii and spacing in em: the biggest fan gets `max`, nobody drops below `min` (a face still has to read). */
export const BUBBLE_RADII: Record<BubbleCardSize, { min: number; max: number; gap: number }> = {
  large: { min: 0.95, max: 1.9, gap: 0.35 },
  medium: { min: 0.8, max: 1.4, gap: 0.3 },
};

/** At most this many bubbles show; past it the last one becomes "+n". */
export const MAX_BUBBLES = 6;

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Most first; ties keep the server's order. */
function byCount(people: BubblePerson[]): BubblePerson[] {
  return people
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (b.p.count ?? 0) - (a.p.count ?? 0) || a.i - b.i)
    .map(({ p }) => p);
}

/**
 * Largest first, each radius ∝ √count so a bubble's area is proportional to the count, clamped to [min, max].
 * Without counts everyone is the same middling size. Past MAX_BUBBLES the rest fold into one "+n".
 */
export function bubbleRadii(people: BubblePerson[], size: BubbleCardSize): SizedBubble[] {
  const { min, max } = BUBBLE_RADII[size];
  const sorted = byCount(people);
  const shown = sorted.length > MAX_BUBBLES ? sorted.slice(0, MAX_BUBBLES - 1) : sorted;
  const top = Math.max(0, ...shown.map((p) => p.count ?? 0));
  const equal = (min + max) / 2;
  const faces: SizedBubble[] = shown.map((p) => ({
    kind: 'face',
    user: p.user,
    count: p.count,
    r: round(
      top > 0 && p.count != null ? Math.min(max, Math.max(min, max * Math.sqrt(Math.max(0, p.count) / top))) : equal
    ),
  }));
  const more = sorted.length - shown.length;
  // The "+n" has to hold a 13px numeral, so it never shrinks to the smallest face.
  return more > 0 ? [...faces, { kind: 'more', more, r: round(Math.max(min, equal * 0.85)) }] : faces;
}

/** 137.5°: the sunflower's step, so no two faces line up however many there are. */
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
/** The whole head is turned so the second face sits up and to the left of the first, back over the card. */
const SUNFLOWER_TURN = Math.PI * 0.75;

/**
 * Sunflower (phyllotaxis): the first (biggest) circle at the centre, the i-th at i × 137.5° round it, its distance
 * growing with √(i − 1) from a first ring snug against the centre, by the smallest step that keeps every circle `gap`
 * clear of the others. Centres are relative to the first circle. Deterministic: the same radii give the same head.
 */
export function sunflowerCircles(radii: number[], gap: number, turn = SUNFLOWER_TURN): { x: number; y: number }[] {
  const base = radii.length > 1 ? radii[0] + gap + radii[1] : 0;
  const at = (step: number) =>
    radii.map((r, i) => {
      const d = i === 0 ? 0 : base + step * Math.sqrt(i - 1);
      return { x: d * Math.cos(i * GOLDEN_ANGLE + turn), y: d * Math.sin(i * GOLDEN_ANGLE + turn), r };
    });
  const clear = (pts: { x: number; y: number; r: number }[]) =>
    pts.every((p, i) => pts.slice(0, i).every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= q.r + p.r + gap - 1e-9));
  for (let step = 0; step < 20; step += 0.02) {
    const pts = at(step);
    if (clear(pts)) return pts;
  }
  return at(20);
}

/**
 * Sizes and positions for a card's bubble cloud, as a sunflower head: centres inside the box, and the centre face's
 * centre as `origin` (the point the head breathes from). Empty when there is nobody to show.
 */
export function layoutBubbles(people: BubblePerson[], size: BubbleCardSize): BubbleLayout {
  const sized = bubbleRadii(people, size);
  if (!sized.length) return { bubbles: [], width: 0, height: 0, origin: { x: 0, y: 0 } };
  const pts = sunflowerCircles(
    sized.map((b) => b.r),
    BUBBLE_RADII[size].gap
  );
  const minX = Math.min(...sized.map((b, i) => pts[i].x - b.r));
  const minY = Math.min(...sized.map((b, i) => pts[i].y - b.r));
  const maxX = Math.max(...sized.map((b, i) => pts[i].x + b.r));
  const maxY = Math.max(...sized.map((b, i) => pts[i].y + b.r));
  const shift = (p: { x: number; y: number }) => ({ x: round(p.x - minX), y: round(p.y - minY) });
  return {
    bubbles: sized.map((b, i) => ({ ...b, ...shift(pts[i]) })),
    width: round(maxX - minX),
    height: round(maxY - minY),
    origin: shift(pts[0]),
  };
}

const plays = (n: number) => `${n} ${n === 1 ? 'play' : 'plays'}`;

/** A person's name as the card says it: the viewer is "you". */
function nameOf(user: string, viewer: string | null | undefined, capital: boolean): string {
  if (viewer && user === viewer) return capital ? 'You' : 'you';
  return user;
}

/** Hover text for one bubble: "Long Alex · 12 plays", or just the name without a count. */
export function bubbleTip(p: BubblePerson, viewer?: string | null): string {
  const name = nameOf(p.user, viewer, true);
  return p.count != null ? `${name} · ${plays(p.count)}` : name;
}

/** The cloud's accessible name, everyone included: "For Long Alex (12 plays) and Sam (5 plays)". */
export function bubbleLabel(people: BubblePerson[], viewer?: string | null): string {
  const parts = byCount(people).map(
    (p) => `${nameOf(p.user, viewer, false)}${p.count != null ? ` (${plays(p.count)})` : ''}`
  );
  if (!parts.length) return '';
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
  return `For ${list}`;
}
