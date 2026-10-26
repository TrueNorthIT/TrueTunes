/**
 * Alternative arrangements for the FanBubbles cloud (an exploration; `column` is what PR #190 ships). Each takes the
 * same count-sized bubbles from `bubbleRadii` and places them differently. Pure maths in `em`, deterministic.
 *
 * A layout returns centres inside its own box, an `origin` (the point a shared sway or breath turns about), optional
 * `links` (constellation lines) and, for `orbit`, each satellite's ellipse so the CSS can move it round.
 */
import {
  BUBBLE_RADII,
  bubbleRadii,
  packCircles,
  type BubbleCardSize,
  type BubblePerson,
  type SizedBubble,
} from './pickBubbles';

export const ARRANGEMENTS = [
  'column',
  'spiral',
  'sunflower',
  'packed',
  'orbit',
  'arc',
  'stack',
  'constellation',
] as const;
export type BubbleArrangement = (typeof ARRANGEMENTS)[number];

/** A satellite's orbit: an ellipse round (cx, cy) with semi-axes a × b, once every `period` seconds from `phase`. */
export interface Orbit {
  cx: number;
  cy: number;
  a: number;
  b: number;
  /** Radians, screen axes (0 = right, π/2 = down). Its rest position is the point at this phase. */
  phase: number;
  /** Seconds per lap; negative goes the other way round. */
  period: number;
}

export type ArrangedBubble = SizedBubble & {
  x: number;
  y: number;
  /** Stacking order (soft stack): higher is in front. */
  z?: number;
  orbit?: Orbit;
  /** Soft stack: how far this face slides out along the pile when it breathes. */
  spread?: { x: number; y: number };
};

export interface Arranged {
  bubbles: ArrangedBubble[];
  width: number;
  height: number;
  /** The point a whole-cloud sway or breath turns about (the spiral's eye, the sunflower's centre). */
  origin: { x: number; y: number };
  /** Pairs of bubble indices joined by a faint line (constellation). */
  links: [number, number][];
}

const PHI = (1 + Math.sqrt(5)) / 2;
/** 137.5°: the sunflower's step. */
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const round = (n: number) => Math.round(n * 1000) / 1000;

interface Circle {
  x: number;
  y: number;
  r: number;
}

const clearOf = (placed: Circle[], c: Circle, gap: number) =>
  placed.every((q) => Math.hypot(q.x - c.x, q.y - c.y) >= q.r + c.r + gap - 1e-9);

/**
 * Shift circles so the box starts at 0,0, and size the box. `extra` circles (orbit sweeps, a card corner) count
 * towards the box but are not bubbles.
 */
function boxed(circles: Circle[], extra: Circle[] = []) {
  const all = [...circles, ...extra];
  const minX = Math.min(...all.map((c) => c.x - c.r));
  const minY = Math.min(...all.map((c) => c.y - c.r));
  const maxX = Math.max(...all.map((c) => c.x + c.r));
  const maxY = Math.max(...all.map((c) => c.y + c.r));
  return {
    shift: (p: { x: number; y: number }) => ({ x: round(p.x - minX), y: round(p.y - minY) }),
    width: round(maxX - minX),
    height: round(maxY - minY),
  };
}

function finish(
  sized: SizedBubble[],
  circles: Circle[],
  extra: Circle[] = [],
  links: [number, number][] = []
): Arranged {
  const { shift, width, height } = boxed(circles, extra);
  return {
    bubbles: sized.map((b, i) => ({ ...b, ...shift(circles[i]) })),
    width,
    height,
    origin: shift(circles[0]),
    links,
  };
}

/**
 * Golden spiral: the biggest face is the eye; each next one goes further round a spiral that widens by φ every
 * quarter turn, at the first point along it that is clear of everyone placed. `turn` rotates the whole spiral.
 */
export function spiralCircles(radii: number[], gap: number, turn = 0): Circle[] {
  if (!radii.length) return [];
  const placed: Circle[] = [{ x: 0, y: 0, r: radii[0] }];
  const growth = Math.log(PHI) / (Math.PI / 2);
  const a = radii[0] + gap + (radii[1] ?? 0);
  let theta = 0;
  for (const r of radii.slice(1)) {
    for (let k = 0; k < 2000; k++, theta += 0.01) {
      const d = a * Math.exp(growth * theta);
      const c = { x: d * Math.cos(theta + turn), y: d * Math.sin(theta + turn), r };
      if (clearOf(placed, c, gap)) {
        placed.push(c);
        break;
      }
    }
  }
  return placed;
}

/**
 * Sunflower (phyllotaxis): the i-th face at i × 137.5° round the biggest, its distance growing with √(i − 1) by the
 * smallest step that keeps every face `gap` clear of the others.
 */
export function sunflowerCircles(radii: number[], gap: number, turn = 0): Circle[] {
  // The first ring starts snug against the centre face; past it the spacing grows with √i as in a sunflower head.
  const base = radii.length > 1 ? radii[0] + gap + radii[1] : 0;
  const at = (c: number) =>
    radii.map((r, i) => {
      const d = i === 0 ? 0 : base + c * Math.sqrt(i - 1);
      return { x: d * Math.cos(i * GOLDEN_ANGLE + turn), y: d * Math.sin(i * GOLDEN_ANGLE + turn), r };
    });
  for (let c = 0; c < 20; c += 0.02) {
    const pts = at(c);
    if (pts.every((p, i) => clearOf(pts.slice(0, i), p, gap))) return pts;
  }
  return at(20);
}

/** Satellites per ring: the first three faces after the centre on the inner ring, the rest on the outer. */
const INNER_RING = 3;
/** The orbits are wider than tall, so the cloud stays a band across the art rather than a tall column. */
const ORBIT_ASPECT = 1.35;

/**
 * Orbit: the biggest face in the middle, the next three evenly round an inner ellipse, the rest round an outer one
 * going the other way, slower. Each ring clears the one inside it at its narrowest, so no two faces ever touch.
 */
export function orbitLayout(sized: SizedBubble[], gap: number): Arranged {
  const radii = sized.map((b) => b.r);
  const r0 = radii[0] ?? 0;
  const inner = radii.slice(1, 1 + INNER_RING);
  const outer = radii.slice(1 + INNER_RING);
  const maxIn = Math.max(0, ...inner);
  const maxOut = Math.max(0, ...outer);
  const b1 = r0 + gap + maxIn;
  const b2 = b1 + maxIn + maxOut + gap * 2;
  const rings = [
    { b: b1, count: inner.length, start: -Math.PI / 5, period: 48 },
    { b: b2, count: outer.length, start: Math.PI * 0.62, period: -76 },
  ];
  const orbits: Orbit[] = [];
  rings.forEach((ring) => {
    for (let k = 0; k < ring.count; k++)
      orbits.push({
        cx: 0,
        cy: 0,
        a: ring.b * ORBIT_ASPECT,
        b: ring.b,
        phase: ring.start + (k * 2 * Math.PI) / ring.count,
        period: ring.period,
      });
  });
  const circles: Circle[] = [
    { x: 0, y: 0, r: r0 },
    ...orbits.map((o, i) => ({ x: o.a * Math.cos(o.phase), y: o.b * Math.sin(o.phase), r: radii[i + 1] })),
  ];
  // The box holds every point of every lap, not just where the faces rest.
  const sweep: Circle[] = orbits.flatMap((o, i) => [
    { x: -o.a, y: 0, r: radii[i + 1] },
    { x: o.a, y: 0, r: radii[i + 1] },
    { x: 0, y: -o.b, r: radii[i + 1] },
    { x: 0, y: o.b, r: radii[i + 1] },
  ]);
  const { shift, width, height } = boxed(circles, sweep);
  const centre = shift({ x: 0, y: 0 });
  return {
    bubbles: sized.map((b, i) => {
      const p = shift(circles[i]);
      const o = orbits[i - 1];
      return o
        ? {
            ...b,
            ...p,
            orbit: {
              ...o,
              cx: centre.x,
              cy: centre.y,
              a: round(o.a),
              b: round(o.b),
              phase: round(o.phase),
            },
          }
        : { ...b, ...p };
    }),
    width,
    height,
    origin: centre,
    links: [],
  };
}

/** Keep the arc this far in from the card's top and right edges (em). */
const ARC_MARGIN = 0.9;

/**
 * Corner arc: the biggest face tucked into the card's top-right corner, the rest swept round it on a quarter circle
 * centred on the corner, biggest at the right-edge end and shrinking towards the top edge. The box's top-right is the
 * card corner, so the cloud anchors there.
 */
export function arcCircles(radii: number[], gap: number): { circles: Circle[]; corner: Circle } {
  if (!radii.length) return { circles: [], corner: { x: 0, y: 0, r: 0 } };
  const r0 = radii[0];
  const eye = { x: -(ARC_MARGIN + r0), y: ARC_MARGIN + r0, r: r0 };
  const rest = radii.slice(1);
  if (!rest.length) return { circles: [eye], corner: { x: 0, y: 0, r: 0 } };
  const maxR = Math.max(...rest);
  let R = Math.hypot(eye.x, eye.y) + r0 + gap * 2 + maxR;
  // Angles are screen-axis: π/2 points straight down from the corner, π straight left.
  for (let tries = 0; tries < 200; tries++, R += 0.1) {
    const steps = rest.slice(1).map((r, i) => 2 * Math.asin(Math.min(1, (rest[i] + r + gap * 2) / (2 * R))));
    const span = steps.reduce((s, x) => s + x, 0);
    const lo = Math.PI / 2 + Math.asin(Math.min(1, (ARC_MARGIN + rest[0]) / R));
    const hi = Math.PI - Math.asin(Math.min(1, (ARC_MARGIN + rest[rest.length - 1]) / R));
    if (span > hi - lo) continue;
    // Centre the run on the diagonal when it has room to spare, so a few faces sit together, not at the two ends.
    let theta = Math.max(lo, Math.min(hi - span, (3 * Math.PI) / 4 - span / 2));
    const circles: Circle[] = [eye];
    rest.forEach((r, i) => {
      if (i > 0) theta += steps[i - 1];
      circles.push({ x: R * Math.cos(theta), y: R * Math.sin(theta), r });
    });
    return { circles, corner: { x: 0, y: 0, r: 0 } };
  }
  return { circles: [eye], corner: { x: 0, y: 0, r: 0 } };
}

/** Soft stack: each face this fraction of the two radii further along the pile's line than the one in front. */
const STACK_STEP = 0.72;
/** The pile runs up and to the right from the front face. */
const STACK_DIR = { x: 0.6, y: -0.8 };

/**
 * Soft stack: a diagonal pile, biggest in front at the lower left, each next one behind it and up to the right,
 * alternately either side of the line, so neighbours overlap a little and the pile looks set down rather than ruled.
 */
export function stackLayout(sized: SizedBubble[]): Arranged {
  const circles: Circle[] = [];
  let along = 0;
  sized.forEach((b, i) => {
    if (i > 0) along += STACK_STEP * (sized[i - 1].r + b.r);
    // Behind the front face the pile zigzags either side of its line, like coins slid off a stack.
    const side = i === 0 ? 0 : (i % 2 ? 1 : -1) * 0.75 * b.r;
    circles.push({
      x: STACK_DIR.x * along - STACK_DIR.y * side,
      y: STACK_DIR.y * along + STACK_DIR.x * side,
      r: b.r,
    });
  });
  const base = finish(sized, circles);
  return {
    ...base,
    bubbles: base.bubbles.map((b, i) => ({
      ...b,
      z: sized.length - i,
      spread: { x: round(STACK_DIR.x * 0.16 * i), y: round(STACK_DIR.y * 0.16 * i) },
    })),
  };
}

/** The constellation's field on each card size (em), anchored top right under the caption line. */
export const CONSTELLATION_FIELD: Record<BubbleCardSize, { w: number; h: number }> = {
  large: { w: 22, h: 12.5 },
  medium: { w: 14, h: 8 },
};

/** A small seeded generator, so a constellation is the same on every render. */
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Constellation: faces spread loosely over a field, each at the best of a few dozen seeded candidate spots (the one
 * furthest from everyone placed), biggest first near the middle. Joined by a minimum spanning tree of faint lines.
 */
export function constellationCircles(
  radii: number[],
  field: { w: number; h: number },
  gap: number,
  seed = 7
): Circle[] {
  const rand = mulberry32(seed + radii.length * 101);
  const placed: Circle[] = [];
  radii.forEach((r, i) => {
    if (i === 0) {
      placed.push({ x: field.w * 0.56, y: field.h * 0.46, r });
      return;
    }
    let best: { c: Circle; score: number } | null = null;
    for (let k = 0; k < 60; k++) {
      const c = { x: r + rand() * (field.w - 2 * r), y: r + rand() * (field.h - 2 * r), r };
      const score = Math.min(...placed.map((q) => Math.hypot(q.x - c.x, q.y - c.y) - q.r - c.r));
      if (score < gap * 3) continue;
      if (!best || score > best.score) best = { c, score };
    }
    placed.push(best?.c ?? { x: r, y: r, r });
  });
  return placed;
}

/** Prim's minimum spanning tree over the centres: the fewest, shortest lines that join everyone. */
export function spanningLinks(points: { x: number; y: number }[]): [number, number][] {
  if (points.length < 2) return [];
  const inTree = new Set([0]);
  const links: [number, number][] = [];
  while (inTree.size < points.length) {
    let best: { from: number; to: number; d: number } | null = null;
    for (const from of inTree)
      points.forEach((p, to) => {
        if (inTree.has(to)) return;
        const d = Math.hypot(points[from].x - p.x, points[from].y - p.y);
        if (!best || d < best.d) best = { from, to, d };
      });
    if (!best) break;
    const { from, to } = best;
    links.push([from, to]);
    inTree.add(to);
  }
  return links;
}

/** Sizes and positions for a card's bubble cloud in the given arrangement. Empty when there is nobody to show. */
export function arrangeBubbles(people: BubblePerson[], size: BubbleCardSize, arrangement: BubbleArrangement): Arranged {
  const sized = bubbleRadii(people, size);
  if (!sized.length) return { bubbles: [], width: 0, height: 0, origin: { x: 0, y: 0 }, links: [] };
  const { gap } = BUBBLE_RADII[size];
  const radii = sized.map((b) => b.r);
  switch (arrangement) {
    case 'column': {
      const { points, width, height } = packCircles(radii, gap);
      return { bubbles: sized.map((b, i) => ({ ...b, ...points[i] })), width, height, origin: points[0], links: [] };
    }
    case 'spiral':
      return finish(sized, spiralCircles(radii, gap, Math.PI * 0.85));
    case 'sunflower':
      return finish(sized, sunflowerCircles(radii, gap, Math.PI * 0.75));
    case 'packed': {
      const { points, width, height } = packCircles(radii, gap, 1);
      return { bubbles: sized.map((b, i) => ({ ...b, ...points[i] })), width, height, origin: points[0], links: [] };
    }
    case 'orbit':
      return orbitLayout(sized, gap);
    case 'arc': {
      const { circles, corner } = arcCircles(radii, gap);
      return finish(sized, circles, [corner]);
    }
    case 'stack':
      return stackLayout(sized);
    case 'constellation': {
      const circles = constellationCircles(radii, CONSTELLATION_FIELD[size], gap);
      const field = { x: 0, y: 0, r: 0 };
      const corner = { x: CONSTELLATION_FIELD[size].w, y: CONSTELLATION_FIELD[size].h, r: 0 };
      return finish(sized, circles, [field, corner], spanningLinks(circles));
    }
  }
}
