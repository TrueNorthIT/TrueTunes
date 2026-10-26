/**
 * The bubble cloud of who a pick is for: each person's face sized by how much they like the artist, packed loosely
 * into a small cluster that hangs on the right of a pick card. Pure maths, all in `em`, so the card scales it.
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

/**
 * Pack circles (in the order given, largest first) into a loose cluster: each touches an earlier one, `gap` clear
 * of all of them, at the spot nearest the first circle's centre. Vertical distance counts double, so the cloud
 * grows sideways more than down and stays clear of the caption. Deterministic: the same radii give the same cloud.
 */
export function packCircles(
  radii: number[],
  gap: number,
  /** How much more vertical distance counts than horizontal: 4 keeps the column wide, 1 packs a round cluster. */
  squash = 4
): { points: { x: number; y: number }[]; width: number; height: number } {
  const placed: { x: number; y: number; r: number }[] = [];
  const STEPS = 36;
  for (const r of radii) {
    if (!placed.length) {
      placed.push({ x: 0, y: 0, r });
      continue;
    }
    let best: { x: number; y: number; score: number } | null = null;
    for (const p of placed) {
      const d = p.r + r + gap;
      for (let k = 0; k < STEPS; k++) {
        const a = (k / STEPS) * Math.PI * 2;
        const x = p.x + d * Math.cos(a);
        const y = p.y + d * Math.sin(a);
        const clear = placed.every((q) => Math.hypot(q.x - x, q.y - y) >= q.r + r + gap - 1e-9);
        if (!clear) continue;
        const score = x * x + squash * y * y;
        if (!best || score < best.score - 1e-9) best = { x, y, score };
      }
    }
    // A ring of 36 spots round every earlier circle always has a clear one on the outside of the cluster.
    placed.push({ x: best?.x ?? 0, y: best?.y ?? 0, r });
  }
  if (!placed.length) return { points: [], width: 0, height: 0 };
  const minX = Math.min(...placed.map((c) => c.x - c.r));
  const minY = Math.min(...placed.map((c) => c.y - c.r));
  const maxX = Math.max(...placed.map((c) => c.x + c.r));
  const maxY = Math.max(...placed.map((c) => c.y + c.r));
  return {
    points: placed.map((c) => ({ x: round(c.x - minX), y: round(c.y - minY) })),
    width: round(maxX - minX),
    height: round(maxY - minY),
  };
}

/** Sizes and positions for a card's bubble cloud. Empty when there is nobody to show. */
export function layoutBubbles(people: BubblePerson[], size: BubbleCardSize): BubbleLayout {
  const sized = bubbleRadii(people, size);
  const { points, width, height } = packCircles(
    sized.map((b) => b.r),
    BUBBLE_RADII[size].gap
  );
  return { bubbles: sized.map((b, i) => ({ ...b, ...points[i] })), width, height };
}

/**
 * Each bubble's slow drift: a few px (0.14–0.3em each way) over 5.5–9.5s, with a different path, pace and phase per
 * bubble so the cloud never moves in step.
 */
export function driftFor(i: number): { dx: number; dy: number; duration: number; delay: number } {
  // A cheap deterministic scramble of the index: varied, but the same on every render.
  const f = (seed: number) => {
    const s = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453;
    return s - Math.floor(s);
  };
  const amp = (seed: number) => (0.14 + f(seed) * 0.16) * (f(seed + 7) < 0.5 ? -1 : 1);
  return {
    dx: round(amp(1)),
    dy: round(amp(2)),
    duration: round(5.5 + f(3) * 4),
    delay: round(-f(4) * 6),
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
