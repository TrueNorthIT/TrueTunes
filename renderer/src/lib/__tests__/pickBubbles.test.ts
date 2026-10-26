import { describe, it, expect } from 'vitest';
import {
  BUBBLE_RADII,
  MAX_BUBBLES,
  bubbleLabel,
  bubbleRadii,
  bubbleTip,
  GOLDEN_ANGLE,
  layoutBubbles,
  sunflowerCircles,
  type BubbleLayout,
} from '../pickBubbles';

const fans = (...counts: number[]) => counts.map((count, i) => ({ user: `P${i + 1}`, count }));

function overlaps(l: BubbleLayout, gap: number): string[] {
  const bad: string[] = [];
  l.bubbles.forEach((a, i) =>
    l.bubbles.slice(i + 1).forEach((b, j) => {
      if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r + gap - 2e-3 /* rounded to 0.001em */)
        bad.push(`${i}-${i + 1 + j}`);
    })
  );
  return bad;
}

describe('bubbleRadii', () => {
  it('gives the biggest fan the largest bubble and scales area with the count (radius ∝ √count)', () => {
    const r = bubbleRadii(fans(16, 4), 'large');
    expect(r[0].r).toBe(BUBBLE_RADII.large.max);
    // A quarter of the plays is a quarter of the area: half the radius.
    expect(r[1].r).toBeCloseTo(BUBBLE_RADII.large.max / 2, 3);
  });

  it('sorts largest first whatever order the server sent, keeping ties in order', () => {
    const r = bubbleRadii(
      [
        { user: 'Sam', count: 2 },
        { user: 'Long Alex', count: 12 },
        { user: 'Rich', count: 2 },
      ],
      'large'
    );
    expect(r.map((b) => (b.kind === 'face' ? b.user : '+'))).toEqual(['Long Alex', 'Sam', 'Rich']);
  });

  it('never shrinks a face below the minimum', () => {
    const r = bubbleRadii(fans(1000, 1), 'medium');
    expect(r[1].r).toBe(BUBBLE_RADII.medium.min);
  });

  it('makes everyone the same size without counts', () => {
    const r = bubbleRadii([{ user: 'A' }, { user: 'B' }, { user: 'C' }], 'large');
    expect(new Set(r.map((b) => b.r)).size).toBe(1);
    expect(r[0].r).toBeGreaterThan(BUBBLE_RADII.large.min);
    expect(r[0].r).toBeLessThan(BUBBLE_RADII.large.max);
  });

  it(`caps at ${MAX_BUBBLES} bubbles, the last a "+n" for the rest`, () => {
    const r = bubbleRadii(fans(9, 8, 7, 6, 5, 4, 3, 2, 1), 'large');
    expect(r).toHaveLength(MAX_BUBBLES);
    expect(r[MAX_BUBBLES - 1]).toMatchObject({ kind: 'more', more: 9 - (MAX_BUBBLES - 1) });
    expect(bubbleRadii(fans(3, 2, 1, 1, 1, 1), 'large').every((b) => b.kind === 'face')).toBe(true);
  });
});

describe('layoutBubbles (sunflower)', () => {
  const scenarios = [[12], [12, 5], [24, 15, 8, 4], [30, 9, 4, 2, 1, 1], [31, 18, 9, 6, 3, 2, 1, 1]];

  it('places every face a gap clear of the others, inside its box', () => {
    for (const size of ['large', 'medium'] as const) {
      for (const counts of scenarios) {
        const l = layoutBubbles(fans(...counts), size);
        expect(overlaps(l, BUBBLE_RADII[size].gap)).toEqual([]);
        for (const b of l.bubbles) {
          expect(b.x - b.r).toBeGreaterThanOrEqual(-1e-6);
          expect(b.y - b.r).toBeGreaterThanOrEqual(-1e-6);
          expect(b.x + b.r).toBeLessThanOrEqual(l.width + 1e-6);
          expect(b.y + b.r).toBeLessThanOrEqual(l.height + 1e-6);
        }
      }
    }
  });

  it('puts the biggest face in the middle and breathes from it', () => {
    const l = layoutBubbles(fans(31, 18, 9, 6, 3, 2, 1, 1), 'large');
    const [first, ...rest] = l.bubbles;
    expect(first.r).toBe(BUBBLE_RADII.large.max);
    expect(l.origin).toEqual({ x: first.x, y: first.y });
    // Everyone else is round it, none nearer than the first ring.
    const ring = first.r + BUBBLE_RADII.large.gap + rest[0].r;
    for (const b of rest) expect(Math.hypot(b.x - first.x, b.y - first.y)).toBeGreaterThanOrEqual(ring - 2e-3);
  });

  it('steps each face round the centre by the golden angle (137.5°)', () => {
    expect((GOLDEN_ANGLE * 180) / Math.PI).toBeCloseTo(137.508, 3);
    const pts = sunflowerCircles([1.9, 1.5, 1.2, 1, 1], 0.35, 0);
    for (let i = 1; i < pts.length; i++) {
      const a = Math.atan2(pts[i].y, pts[i].x);
      const turn = (((a - i * GOLDEN_ANGLE) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      expect(Math.min(turn, 2 * Math.PI - turn)).toBeCloseTo(0, 6);
    }
  });

  it('starts the first ring snug against the centre face', () => {
    const pts = sunflowerCircles([1.9, 1.2], 0.35, 0);
    expect(Math.hypot(pts[1].x, pts[1].y)).toBeCloseTo(1.9 + 0.35 + 1.2, 6);
  });

  it('stays small enough for a medium card even at the cap', () => {
    const l = layoutBubbles(fans(9, 8, 7, 6, 5, 4, 3, 2, 1), 'medium');
    // Drawn at 1.3×, centred a little above the middle of a 4:3 card at least ~16em wide (12em high, ~13em when
    // squarer on a narrow page): it has to leave the title its bottom ~4em.
    expect(l.width * 1.3).toBeLessThan(11);
    expect(l.height * 1.3).toBeLessThan(11);
  });

  it('is deterministic and empty for nobody', () => {
    expect(layoutBubbles(fans(5, 3, 1), 'large')).toEqual(layoutBubbles(fans(5, 3, 1), 'large'));
    expect(layoutBubbles([], 'large')).toEqual({ bubbles: [], width: 0, height: 0, origin: { x: 0, y: 0 } });
  });

  it('boxes a single bubble exactly', () => {
    const l = layoutBubbles(fans(4), 'medium');
    expect(l.width).toBe(BUBBLE_RADII.medium.max * 2);
    expect(l.bubbles[0]).toMatchObject({ x: BUBBLE_RADII.medium.max, y: BUBBLE_RADII.medium.max });
  });
});

describe('labels', () => {
  it('names everyone with their plays, most first', () => {
    expect(
      bubbleLabel([
        { user: 'Sam', count: 5 },
        { user: 'Long Alex', count: 12 },
      ])
    ).toBe('For Long Alex (12 plays) and Sam (5 plays)');
    expect(bubbleLabel([{ user: 'Sam', count: 1 }])).toBe('For Sam (1 play)');
    expect(bubbleLabel(fans(3, 2, 1))).toBe('For P1 (3 plays), P2 (2 plays) and P3 (1 play)');
  });

  it('says "you" for the viewer, and names only without counts', () => {
    expect(bubbleLabel([{ user: 'Rich', count: 4 }], 'Rich')).toBe('For you (4 plays)');
    expect(bubbleLabel([{ user: 'Rich' }, { user: 'Alex' }])).toBe('For Rich and Alex');
    expect(bubbleLabel([])).toBe('');
  });

  it('tips a bubble with its name and count', () => {
    expect(bubbleTip({ user: 'Long Alex', count: 12 })).toBe('Long Alex · 12 plays');
    expect(bubbleTip({ user: 'Rich', count: 1 }, 'Rich')).toBe('You · 1 play');
    expect(bubbleTip({ user: 'Sam' })).toBe('Sam');
  });
});
