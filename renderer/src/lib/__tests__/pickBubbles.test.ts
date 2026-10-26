import { describe, it, expect } from 'vitest';
import {
  BUBBLE_RADII,
  MAX_BUBBLES,
  bubbleLabel,
  bubbleRadii,
  bubbleTip,
  driftFor,
  layoutBubbles,
  packCircles,
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

describe('packCircles / layoutBubbles', () => {
  it('packs without overlapping, a gap apart, inside its box', () => {
    for (const size of ['large', 'medium'] as const) {
      for (const counts of [[12], [12, 5], [30, 9, 4, 2, 1, 1], [9, 8, 7, 6, 5, 4, 3, 2, 1]]) {
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

  it('spreads sideways more than down, so the cloud stays clear of the caption', () => {
    const l = layoutBubbles(fans(30, 20, 10, 5, 2, 1), 'large');
    expect(l.width).toBeGreaterThan(l.height);
  });

  it('stays small enough for a medium card even at the cap', () => {
    const l = layoutBubbles(fans(9, 8, 7, 6, 5, 4, 3, 2, 1), 'medium');
    // A medium card is at least ~16em wide and leaves ~9em between the caption line and the title.
    expect(l.width).toBeLessThan(10);
    expect(l.height).toBeLessThan(8);
  });

  it('is deterministic and empty for nobody', () => {
    expect(layoutBubbles(fans(5, 3, 1), 'large')).toEqual(layoutBubbles(fans(5, 3, 1), 'large'));
    expect(packCircles([], 0.3)).toEqual({ points: [], width: 0, height: 0 });
    expect(layoutBubbles([], 'large').bubbles).toEqual([]);
  });

  it('boxes a single bubble exactly', () => {
    const l = layoutBubbles(fans(4), 'medium');
    expect(l.width).toBe(BUBBLE_RADII.medium.max * 2);
    expect(l.bubbles[0]).toMatchObject({ x: BUBBLE_RADII.medium.max, y: BUBBLE_RADII.medium.max });
  });
});

describe('driftFor', () => {
  it('moves a few px (well under half an em) each way over several seconds', () => {
    for (let i = 0; i < 8; i++) {
      const d = driftFor(i);
      expect(Math.abs(d.dx)).toBeGreaterThan(0.1);
      expect(Math.abs(d.dx)).toBeLessThanOrEqual(0.3);
      expect(Math.abs(d.dy)).toBeLessThanOrEqual(0.3);
      expect(d.duration).toBeGreaterThanOrEqual(5.5);
      expect(d.duration).toBeLessThanOrEqual(9.5);
      expect(d.delay).toBeLessThanOrEqual(0);
    }
  });

  it('is out of step: no two bubbles share a pace or phase', () => {
    const ds = Array.from({ length: MAX_BUBBLES }, (_, i) => driftFor(i));
    expect(new Set(ds.map((d) => d.duration)).size).toBe(MAX_BUBBLES);
    expect(new Set(ds.map((d) => d.delay)).size).toBe(MAX_BUBBLES);
    expect(driftFor(3)).toEqual(driftFor(3));
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
